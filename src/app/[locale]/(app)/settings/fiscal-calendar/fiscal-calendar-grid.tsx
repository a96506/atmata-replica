"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import type { FiscalPeriod } from "@/types";

/**
 * Client-side grid of fiscal periods with soft/hard-close buttons and
 * year-end close. Toast-only persistence (sessionStorage cache so the
 * state survives navigation within the demo).
 */

const STORAGE_KEY = "atmata.fiscalCalendar.overrides";
const YEAR_LOCK_KEY = "atmata.fiscalCalendar.yearLocked";

type Overrides = Record<string, "open" | "soft_closed" | "hard_closed">;

export function FiscalCalendarGrid({
  initialPeriods,
}: {
  initialPeriods: FiscalPeriod[];
}) {
  const confirm = useConfirm();
  const [overrides, setOverrides] = React.useState<Overrides>({});
  const [yearsLocked, setYearsLocked] = React.useState<number[]>([]);

  React.useEffect(() => {
    try {
      const o = window.sessionStorage.getItem(STORAGE_KEY);
      if (o) setOverrides(JSON.parse(o));
      const y = window.sessionStorage.getItem(YEAR_LOCK_KEY);
      if (y) setYearsLocked(JSON.parse(y));
    } catch {
      /* ignore */
    }
  }, []);

  const periods = initialPeriods.map((p) => ({
    ...p,
    status: overrides[p.id] ?? p.status,
  }));

  const persistOverrides = (next: Overrides) => {
    setOverrides(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const persistYearLocks = (next: number[]) => {
    setYearsLocked(next);
    try {
      window.sessionStorage.setItem(YEAR_LOCK_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const setStatus = async (p: FiscalPeriod, status: "open" | "soft_closed" | "hard_closed") => {
    const label =
      status === "open" ? "Re-open" : status === "soft_closed" ? "Soft-close" : "Hard-close";
    const ok = await confirm({
      title: `${label} ${p.year}-${String(p.month).padStart(2, "0")}?`,
      description:
        status === "hard_closed"
          ? "Posting into this period will be blocked at every form. Demo · will not persist after sign-out."
          : status === "soft_closed"
            ? "Only users with the period.adjust role can post into this period. Demo only."
            : "Period re-opened for posting. Demo only.",
      confirmLabel: label,
      tone: status === "hard_closed" ? "destructive" : "default",
    });
    if (!ok) return;
    persistOverrides({ ...overrides, [p.id]: status });
    toast.success(`${label} ${p.year}-${String(p.month).padStart(2, "0")} (demo)`);
    // eslint-disable-next-line no-console
    console.info("atmata:event", "fiscalCalendar.setStatus", { id: p.id, status });
  };

  const groupedByYear = periods.reduce<Record<number, typeof periods>>((acc, p) => {
    (acc[p.year] ??= []).push(p);
    return acc;
  }, {});

  const closeYear = async (year: number) => {
    const months = groupedByYear[year];
    const allHardClosed = months.every((m) => m.status === "hard_closed");
    if (!allHardClosed) {
      toast.error(`All 12 months of ${year} must be hard-closed first.`);
      return;
    }
    const ok = await confirm({
      title: `Close fiscal year ${year}?`,
      description:
        "Generates a synthetic retained-earnings JE and stamps the year as locked. Posting into any month of this year will be blocked. Demo only.",
      confirmLabel: "Close year",
      tone: "destructive",
    });
    if (!ok) return;
    persistYearLocks([...yearsLocked, year]);
    toast.success(`Year ${year} closed (demo) · synthetic RE journal entry queued.`);
    // eslint-disable-next-line no-console
    console.info("atmata:event", "fiscalCalendar.closeYear", { year });
  };

  return (
    <div className="space-y-6">
      {Object.entries(groupedByYear).map(([yearStr, months]) => {
        const year = Number(yearStr);
        const locked = yearsLocked.includes(year);
        const allHardClosed = months.every((m) => m.status === "hard_closed");
        return (
          <section key={year} className="rounded-xl border border-border bg-card p-4">
            <header className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">FY {year}</h2>
                {locked ? (
                  <span className="rounded-full bg-status-danger-muted px-2 py-0.5 text-xs font-medium text-destructive">
                    Year locked
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => closeYear(year)}
                disabled={locked || !allHardClosed}
                className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                title={!allHardClosed ? "Hard-close every month first." : ""}
              >
                Close year {year}
              </button>
            </header>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {months
                .sort((a, b) => a.month - b.month)
                .map((p) => {
                  const tone =
                    p.status === "hard_closed"
                      ? "border-status-danger-border bg-status-danger-muted"
                      : p.status === "soft_closed"
                        ? "border-status-pending-border bg-status-pending-muted"
                        : "border-status-success-border bg-status-success-muted";
                  return (
                    <div key={p.id} className={`rounded-md border p-2 text-xs ${tone}`}>
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
                        {p.status !== "soft_closed" ? (
                          <button
                            type="button"
                            onClick={() => setStatus(p, "soft_closed")}
                            disabled={locked}
                            className="cursor-pointer rounded border border-status-pending-border bg-card px-2 py-0.5 text-[10px] text-status-pending-foreground hover:bg-status-pending-muted disabled:opacity-50"
                          >
                            Soft
                          </button>
                        ) : null}
                        {p.status !== "hard_closed" ? (
                          <button
                            type="button"
                            onClick={() => setStatus(p, "hard_closed")}
                            disabled={locked}
                            className="cursor-pointer rounded border border-status-danger-border bg-card px-2 py-0.5 text-[10px] text-destructive hover:bg-status-danger-muted disabled:opacity-50"
                          >
                            Hard
                          </button>
                        ) : null}
                        {p.status !== "open" ? (
                          <button
                            type="button"
                            onClick={() => setStatus(p, "open")}
                            disabled={locked}
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
