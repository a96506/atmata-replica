import { cache } from "react";
import { createInsForgeServerClient } from "../insforge/server";
import { camelize } from "./case";

const PAGE_SIZE = 500;

type BackendError = {
  code?: string;
  message?: string;
};

export type ReadResult<T> = {
  data: T | null;
  error: BackendError | null;
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

export async function allPages<T>(
  fetchPage: (from: number, to: number) => Promise<ReadResult<T[]>>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = requireData(await fetchPage(from, from + PAGE_SIZE - 1), context);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
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

export type ReadFilter = {
  column: string;
  value: string;
};

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
      for (const filter of filters) query = query.eq(filter.column, filter.value);
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
