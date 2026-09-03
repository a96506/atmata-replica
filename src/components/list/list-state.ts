/**
 * Shared list-state helpers (no "use client").
 * Server pages must import from here — not from ListStateFilter.tsx —
 * so RSC does not try to invoke client-module exports
 * (see https://github.com/vercel/next.js/issues/66604).
 */

export type ListStateValue = "draft" | "pending" | "posted" | null;

/** Coerce a raw `?state=` param into a known DocState or null (All). */
export function normalizeListState(value: string | undefined): ListStateValue {
  if (!value) return null;
  if (value === "draft" || value === "pending" || value === "posted") return value;
  return null;
}
