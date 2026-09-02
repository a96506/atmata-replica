/**
 * Server-side list paging (`listPage` + `?page=` / `?limit=`).
 * Remaining lists still use `listTable` / `ALL_PAGES_HARD_CAP` (1000) —
 * move to server-side pagination when a tenant table exceeds 1000 rows.
 */

/** Default page size for server-paginated list reads (`listPage`). */
export const DEFAULT_LIST_PAGE_SIZE = 50;

/** Upper bound for a single `listPage` / `?limit=` request. */
export const MAX_LIST_PAGE_SIZE = 100;

export type ParsedListPage = {
  /** 1-based page index from `?page=` (default 1). */
  page: number;
  limit: number;
  offset: number;
};

type SearchParamValue = string | string[] | undefined;

/**
 * Parse URL list-paging params for Server Components.
 * Source of truth: `?page=` (1-based) and optional `?limit=`.
 *
 * @example
 * const { page, limit, offset } = parseListPage(await searchParams);
 * const result = await listPage("invoices", "...", orders, filters, { limit, offset });
 */
export function parseListPage(
  searchParams:
    | { page?: SearchParamValue; limit?: SearchParamValue }
    | URLSearchParams,
  options?: { defaultLimit?: number; maxLimit?: number },
): ParsedListPage {
  const rawPage = readParam(searchParams, "page");
  const rawLimit = readParam(searchParams, "limit");

  const pageNum = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;

  const defaultLimit = options?.defaultLimit ?? DEFAULT_LIST_PAGE_SIZE;
  const maxLimit = options?.maxLimit ?? MAX_LIST_PAGE_SIZE;
  const limitNum = Number.parseInt(rawLimit ?? "", 10);
  const limit = clampInt(
    Number.isFinite(limitNum) && limitNum > 0 ? limitNum : defaultLimit,
    1,
    maxLimit,
  );

  return { page, limit, offset: (page - 1) * limit };
}

function readParam(
  searchParams:
    | { page?: SearchParamValue; limit?: SearchParamValue }
    | URLSearchParams,
  key: "page" | "limit",
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
