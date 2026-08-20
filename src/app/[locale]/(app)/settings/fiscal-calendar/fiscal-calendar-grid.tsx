"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import {
  closeFiscalYearAction,
  setFiscalPeriodStatusAction,
} from "@/lib/actions/period-close";
import type { FiscalPeriod } from "@/types";

/**
 * Client-side grid of fiscal periods with soft/hard-close and year-end close.
 * Persists via set_fiscal_period_status / close_fiscal_year RPCs.
 */

export function FiscalCalendarGrid({
  initialPeriods,
}: {
  initialPeriods: FiscalPeriod[];
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = React.useState(false);
  const [periods, setPeriods] = React.useState(initialPeriods);

  React.useEffect(() => {
    setPeriods(initialPeriods);
  }, [initialPeriods]);

  const setStatus = async (
    p: FiscalPeriod,
    status: "open" | "soft_closed" | "hard_closed",
  ) => {
    const label =
      status === "open"
        ? "Re-open"
        : status === "soft_closed"
          ? "Soft-close"
          : "Hard-close";
    const ok = await confirm({
      title: `${label} ${p.year}-${String(p.month).padStart(2, "0")}?`,
      description:
        status === "hard_closed"
          ? "Posting into this period will be blocked at every form."
          : status === "soft_closed"
            ? "Only users with period.adjust capability can post into this period."
            : "Period re-opened for posting.",
      confirmLabel: label,
      tone: status === "hard_closed" ? "destructive" : "default",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await setFiscalPeriodStatusAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        fiscalPeriodId: p.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error.messageKey || result.error.code);
        return;
      }
      setPeriods((prev) =>
        prev.map((row) => (row.id === p.id ? { ...row, status } : row)),
      );
      toast.success(
        `${label} ${p.year}-${String(p.month).padStart(2, "0")}.`,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const groupedByYear = periods.reduce<Record<number, typeof periods>>(
    (acc, p) => {
      (acc[p.year] ??= []).push(p);
      return acc;
    },
    {},
  );

  const closeYear = async (year: number) => {
    const months = groupedByYear[year] ?? [];
    const hasOpen = months.some((m) => m.status === "open");
    if (hasOpen) {
      toast.error(
        `All 12 months of ${year} must be at least soft-closed before year close.`,
      );
      return;
    }
    if (months.length !== 12) {
      toast.error(`All 12 fiscal periods for ${year} must exist.`);
      return;
    }
    const ok = await confirm({
      title: `Close fiscal year ${year}?`,
      description:
        "Hard-closes any remaining soft-closed months. Posting into any month of this year will be blocked.",
      confirmLabel: "Close year",
      tone: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await closeFiscalYearAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        year,
      });
      if (!result.ok) {
        toast.error(result.error.messageKey || result.error.code);
        return;
      }
      setPeriods((prev) =>
        prev.map((row) =>
          row.year === year ? { ...row, status: "hard_closed" as const } : row,
        ),
      );
      toast.success(`Year ${year} closed.`);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {Object.entries(groupedByYear).map(([yearStr, months]) => {
        const year = Number(yearStr);
        const allAtLeastSoft = months.every((m) => m.status !== "open");
        const yearLocked = months.every((m) => m.status === "hard_closed");
        return (
          <section
            key={year}
            className="rounded-xl border border-border bg-card p-4"
          >
            <header className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  FY {year}
                </h2>
                {yearLocked ? (
                  <span className="rounded-full bg-status-danger-muted px-2 py-0.5 text-xs font-medium text-destructive">
                    Year locked
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void closeYear(year)}
                disabled={pending || yearLocked || !allAtLeastSoft}
                className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !allAtLeastSoft
                    ? "Soft-close every open month first."
                    : undefined
                }
              >
                Close year {year}
              </button>
            </header>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {months
                .slice()
                .sort((a, b) => a.month - b.month)
                .map((p) => {
                  const tone =
                    p.status === "hard_closed"
                      ? "border-status-danger-border bg-status-danger-muted"
                      : p.status === "soft_closed"
                        ? "border-status-pending-border bg-status-pending-muted"
                        : "border-status-success-border bg-status-success-muted";
                  return (
                    <div
                      key={p.id}
                      className={`rounded-md border p-2 text-xs ${tone}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-[11px] text-foreground">
                          {String(p.month).padStart(2, "0")}/{p.year}
                        </div>
                        <span
                          className={
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                            (p.status === "hard_closed"
                              ? "bg-status-danger-muted text-destructive"
                              : p.status === "soft_closed"
                                ? "bg-status-pending-muted text-status-pending-foreground"
                                : "bg-status-success-muted text-status-success-foreground")
                          }
                        >
                          {p.status === "open"
                            ? "open"
                            : p.status === "soft_closed"
                              ? "soft"
                              : "hard"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.status === "open" ? (
                          <button
                            type="button"
                            onClick={() => void setStatus(p, "soft_closed")}
                            disabled={pending || yearLocked}
                            className="cursor-pointer rounded border border-status-pending-border bg-card px-2 py-0.5 text-[10px] text-status-pending-foreground hover:bg-status-pending-muted disabled:opacity-50"
                          >
                            Soft
                          </button>
                        ) : null}
                        {p.status === "soft_closed" ? (
                          <button
                            type="button"
                            onClick={() => void setStatus(p, "hard_closed")}
                            disabled={pending || yearLocked}
                            className="cursor-pointer rounded border border-status-danger-border bg-card px-2 py-0.5 text-[10px] text-destructive hover:bg-status-danger-muted disabled:opacity-50"
                          >
                            Hard
                          </button>
                        ) : null}
                        {p.status !== "open" ? (
                          <button
                            type="button"
                            onClick={() => void setStatus(p, "open")}
                            disabled={pending || yearLocked}
                            className="cursor-pointer rounded border border-status-success-border bg-card px-2 py-0.5 text-[10px] text-status-success-foreground hover:bg-status-success-muted disabled:opacity-50"
                          >
                            Open
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
