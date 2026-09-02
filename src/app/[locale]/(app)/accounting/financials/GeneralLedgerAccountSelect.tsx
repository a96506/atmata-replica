"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/types";

/**
 * Account filter for the general ledger tab. Preserves period and type query params.
 */
export function GeneralLedgerAccountSelect({
  locale,
  type,
  accounts,
  periodId,
  currentAccountId,
  fromDate,
  toDate,
}: {
  locale: string;
  type: string;
  accounts: Account[];
  periodId?: string;
  currentAccountId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const router = useRouter();
  const options = React.useMemo(
    () =>
      accounts
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          value: a.id,
          label: `${a.code} ${a.name}`.trim(),
        })),
    [accounts],
  );

  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <span className="text-xs text-muted-foreground">Account</span>
      <select
        value={currentAccountId ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          const params = new URLSearchParams({ type });
          if (periodId) params.set("period", periodId);
          if (value) params.set("account", value);
          if (fromDate) params.set("from", fromDate);
          if (toDate) params.set("to", toDate);
          router.push(`/${locale}/accounting/financials?${params.toString()}`);
        }}
        className="max-w-xs rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      >
        <option value="">All accounts</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
