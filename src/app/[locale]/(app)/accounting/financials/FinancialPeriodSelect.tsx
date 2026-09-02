"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { FiscalPeriod } from "@/types";

/**
 * Period selector for the financial statements page. Defaults to the current
 * month (see `pickCurrentPeriodId`) but lets the user switch to any fiscal
 * period. Navigation re-runs the server fetch with the new `period` query.
 */
export function FinancialPeriodSelect({
  locale,
  type,
  periods,
  currentPeriodId,
  accountId,
  fromDate,
  toDate,
}: {
  locale: string;
  type: string;
  periods: FiscalPeriod[];
  currentPeriodId?: string;
  /** Preserved when switching period (trial balance / GL filters). */
  accountId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const router = useRouter();
  const options = React.useMemo(
    () =>
      periods
        .slice()
        .sort((a, b) => b.year - a.year || b.month - a.month)
        .map((p) => ({
          value: p.id,
          label: `${p.year}-${String(p.month).padStart(2, "0")}`,
        })),
    [periods],
  );

  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <span className="text-xs text-muted-foreground">Period</span>
      <select
        value={currentPeriodId ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          const params = new URLSearchParams({ type });
          if (value) params.set("period", value);
          if (accountId) params.set("account", accountId);
          if (fromDate) params.set("from", fromDate);
          if (toDate) params.set("to", toDate);
          router.push(`/${locale}/accounting/financials?${params.toString()}`);
        }}
        className="rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      >
        {options.length === 0 ? (
          <option value="">No fiscal periods</option>
        ) : (
          options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
