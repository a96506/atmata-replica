"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/types";

function buildQuery(
  type: string,
  params: {
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  },
): string {
  const q = new URLSearchParams({ type });
  if (params.period) q.set("period", params.period);
  if (params.account) q.set("account", params.account);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return q.toString();
}

export function TrialBalanceFilters({
  locale,
  type,
  accounts,
  periodId,
  accountId,
  fromDate,
  toDate,
}: {
  locale: string;
  type: string;
  accounts: Account[];
  periodId?: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const router = useRouter();
  const [from, setFrom] = React.useState(fromDate ?? "");
  const [to, setTo] = React.useState(toDate ?? "");

  React.useEffect(() => {
    setFrom(fromDate ?? "");
    setTo(toDate ?? "");
  }, [fromDate, toDate]);

  const navigate = (next: {
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  }) => {
    router.push(
      `/${locale}/accounting/financials?${buildQuery(type, {
        period: next.period ?? periodId,
        account: next.account ?? accountId,
        from: next.from ?? from,
        to: next.to ?? to,
      })}`,
    );
  };

  const accountOptions = React.useMemo(
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
    <div className="flex flex-wrap items-end gap-3 text-sm text-foreground">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Account</span>
        <select
          value={accountId ?? ""}
          onChange={(e) => {
            navigate({ account: e.target.value || undefined });
          }}
          className="min-w-[12rem] rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        >
          <option value="">All accounts</option>
          {accountOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => {
            if (from !== (fromDate ?? "")) {
              navigate({ from: from || undefined });
            }
          }}
          className="rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => {
            if (to !== (toDate ?? "")) {
              navigate({ to: to || undefined });
            }
          }}
          className="rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </label>
    </div>
  );
}
