import { FISCAL_PERIODS } from "@/mocks/seed/master";
import type { ISO8601, PeriodStatus } from "@/types";

/**
 * Minimal shape needed to resolve a date to a period status. Kept structural so
 * both the seeded `FiscalPeriod` records and any future API payload satisfy it.
 */
export type PeriodLike = {
  start: ISO8601;
  end: ISO8601;
  status: Exclude<PeriodStatus, "no_period">;
};

export type FiscalCalendar = {
  companyId: string;
  yearStart: string;
  periods: PeriodLike[];
};

/**
 * Single source of truth for fiscal-period resolution. This logic was previously
 * copy-pasted into DatePicker, DocActionBar, and PeriodGate, so a rule change
 * had to be made in four places to take effect.
 */
export function periodStatusFor(
  date: ISO8601 | Date | undefined,
  periods: readonly PeriodLike[] = FISCAL_PERIODS,
): PeriodStatus {
  if (!date) return "no_period";
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  if (Number.isNaN(ts)) return "no_period";
  for (const p of periods) {
    if (ts >= new Date(p.start).getTime() && ts <= new Date(p.end).getTime()) {
      return p.status;
    }
  }
  return "no_period";
}

/**
 * Posting is allowed in open periods, and in soft-closed periods only for users
 * holding the `period_adjust` role. Hard-closed and uncovered dates always block.
 */
export function isPostingAllowed(
  date: ISO8601 | Date | undefined,
  hasAdjustRole = false,
  periods: readonly PeriodLike[] = FISCAL_PERIODS,
): boolean {
  const status = periodStatusFor(date, periods);
  if (status === "open") return true;
  if (status === "soft_closed") return hasAdjustRole;
  return false;
}
