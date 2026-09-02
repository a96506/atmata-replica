import { cache } from "react";
import { createInsForgeServerClient } from "../insforge/server";
import {
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
} from "../list-paging";
import { camelize } from "./case";

export {
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  parseListPage,
} from "../list-paging";
export type { ParsedListPage } from "../list-paging";

const PAGE_SIZE = 500;

/**
 * Hard stop for `allPages` / `listTable` unbounded fetches.
 * move to server-side pagination when a tenant table exceeds 1000 rows.
 */
export const ALL_PAGES_HARD_CAP = 1000;

type BackendError = {
  code?: string;
  message?: string;
};

export type ReadResult<T> = {
  data: T | null;
  error: BackendError | null;
  count?: number | null;
};

export class DataReadError extends Error {
  readonly operation: string;
  readonly resource: string;
  readonly backendCode?: string;

  constructor(operation: string, resource: string, cause?: BackendError | null) {
    super(`Unable to ${operation} ${resource}.`);
    this.name = "DataReadError";
    this.operation = operation;
    this.resource = resource;
    this.backendCode = cause?.code;
    if (cause) this.cause = cause;
  }
}

/** Reuses the cookie-bound SSR client within one React request only. */
export const getReadClient = cache(createInsForgeServerClient);

export function requireData<T>(result: ReadResult<T>, context: string): T {
  if (result.error) throw new DataReadError("read", context, result.error);
  if (result.data === null) throw new DataReadError("read", context);
  return result.data;
}

export function maybeOne<T>(result: ReadResult<T>, context: string): T | null {
  if (result.error) throw new DataReadError("read", context, result.error);
  return result.data;
}

/**
 * Fetch every page until exhausted or {@link ALL_PAGES_HARD_CAP}.
 * move to server-side pagination when a tenant table exceeds 1000 rows.
 */
export async function allPages<T>(
  fetchPage: (from: number, to: number) => Promise<ReadResult<T[]>>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < ALL_PAGES_HARD_CAP; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, ALL_PAGES_HARD_CAP - 1);
    const page = requireData(await fetchPage(from, to), context);
    rows.push(...page);
    // Short page, or we already filled the hard cap — stop.
    // move to server-side pagination when a tenant table exceeds 1000 rows.
    if (page.length < PAGE_SIZE || rows.length >= ALL_PAGES_HARD_CAP) {
      return rows.slice(0, ALL_PAGES_HARD_CAP);
    }
  }
  return rows.slice(0, ALL_PAGES_HARD_CAP);
}

export function mapRows<T>(rows: unknown): T[] {
  return camelize<T[]>(rows);
}

export function mapOne<T>(row: unknown): T | null {
  return row === null ? null : camelize<T>(row);
}

/** Sort embedded child rows by line_order/id, then remove transport-only keys. */
export function normalizeEmbeds<T>(value: T, sortArray = false): T {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeEmbeds(item));
    if (
      sortArray &&
      normalized.every(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      )
    ) {
      normalized.sort((left, right) => {
        const a = left as Record<string, unknown>;
        const b = right as Record<string, unknown>;
        const orderA = typeof a.lineOrder === "number" ? a.lineOrder : 0;
        const orderB = typeof b.lineOrder === "number" ? b.lineOrder : 0;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
    }
    return normalized as T;
  }
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "lineOrder") continue;
    out[key] = normalizeEmbeds(child, true);
  }
  return out as T;
}

export type ReadOrder = {
  column: string;
  ascending?: boolean;
};

export type ReadFilter =
  | { column: string; value: string }
  | { column: string; in: string[] };

export type ListPageParams = { limit?: number; offset?: number };

export type ListPageResult<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

function clampListLimit(limit: number | undefined): number {
  const raw = limit ?? DEFAULT_LIST_PAGE_SIZE;
  if (!Number.isFinite(raw)) return DEFAULT_LIST_PAGE_SIZE;
  return Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, Math.floor(raw)));
}

/**
 * One server page for heavy lists (invoices, journal entries, etc.).
 * Uses PostgREST `select(..., { count: 'exact' })` + `.range(offset, offset+limit-1)`.
 * @see https://docs.insforge.dev/sdks/typescript/database
 */
export async function listPage<T>(
  table: string,
  projection: string,
  orders: ReadOrder[],
  filters: ReadFilter[] = [],
  params?: ListPageParams,
): Promise<ListPageResult<T>> {
  const limit = clampListLimit(params?.limit);
  const offset = Math.max(0, Math.floor(params?.offset ?? 0));
  const client = await getReadClient();

  // The SDK intentionally exposes an untyped PostgREST builder for dynamic tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = client.database
    .from(table)
    .select(projection, { count: "exact" });
  for (const filter of filters) {
    query =
      "in" in filter
        ? query.in(filter.column, filter.in)
        : query.eq(filter.column, filter.value);
  }
  for (const order of orders) {
    query = query.order(order.column, { ascending: order.ascending ?? true });
  }

  const result = (await query.range(
    offset,
    offset + limit - 1,
  )) as ReadResult<unknown[]>;

  const rows = requireData(result, table);
  const items = normalizeEmbeds(mapRows<T>(rows));
  // Prefer Content-Range total from Prefer: count=exact. If count is missing
  // (older proxy / headless path), fall back to items.length so UI still works.
  const total =
    typeof result.count === "number" && Number.isFinite(result.count)
      ? result.count
      : offset + items.length;

  return { items, total, limit, offset };
}

export async function listTable<T>(
  table: string,
  projection: string,
  orders: ReadOrder[],
  filters: ReadFilter[] = [],
): Promise<T[]> {
  const client = await getReadClient();
  const rows = await allPages<unknown>(
    async (from, to) => {
      // The SDK intentionally exposes an untyped PostgREST builder for dynamic tables.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = client.database.from(table).select(projection);
      for (const filter of filters) {
        query =
          "in" in filter
            ? query.in(filter.column, filter.in)
            : query.eq(filter.column, filter.value);
      }
      for (const order of orders) {
        query = query.order(order.column, { ascending: order.ascending ?? true });
      }
      return query.range(from, to);
    },
    table,
  );
  return normalizeEmbeds(mapRows<T>(rows));
}

export async function getTable<T>(
  table: string,
  projection: string,
  id: string,
): Promise<T | null> {
  const client = await getReadClient();
  const result = await client.database
    .from(table)
    .select(projection)
    .eq("id", id)
    .maybeSingle();
  return normalizeEmbeds(mapOne<T>(maybeOne(result, table)));
}

export async function rpcRows<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const client = await getReadClient();
  const result = await client.database.rpc(name, args);
  return normalizeEmbeds(mapRows<T>(requireData(result, name)));
}

/** Scalar / jsonb RPC result (e.g. report_pnl). Camelizes keys. */
export async function rpcData<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const client = await getReadClient();
  const result = await client.database.rpc(name, args);
  return normalizeEmbeds(camelize<T>(requireData(result, name)));
}
