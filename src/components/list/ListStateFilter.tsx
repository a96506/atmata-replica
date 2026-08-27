"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * State filter control for document list views. Mirrors the `state` query
 * param: All / Draft / Pending / Posted. Updates the URL so the page's
 * server component re-runs with the filtered set — no client-side data fetch.
 */

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "posted", label: "Posted" },
] as const;

export type ListStateValue = "draft" | "pending" | "posted" | null;

/** Coerce a raw `?state=` param into a known DocState or null (All). */
export function normalizeListState(value: string | undefined): ListStateValue {
  if (!value) return null;
  if (value === "draft" || value === "pending" || value === "posted") return value;
  return null;
}

export function ListStateFilter({ current }: { current: ListStateValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (value === "all") {
        params.delete("state");
      } else {
        params.set("state", value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const value = current ?? "all";

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium uppercase tracking-wide">Status</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-card px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
