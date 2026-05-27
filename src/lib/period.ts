import type { ISO8601, PeriodStatus } from "@/types";

export type Period = {
  id: string;
  start: ISO8601;
  end: ISO8601;
  status: Exclude<PeriodStatus, "no_period">;
};

export type FiscalCalendar = {
  companyId: string;
  yearStart: string;
  periods: Period[];
};

export function periodStatusFor(
  date: ISO8601 | Date,
  calendar: FiscalCalendar,
): PeriodStatus {
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  for (const p of calendar.periods) {
    if (ts >= new Date(p.start).getTime() && ts <= new Date(p.end).getTime()) {
      return p.status;
    }
  }
  return "no_period";
}

export function isPostingAllowed(
  date: ISO8601 | Date,
  calendar: FiscalCalendar,
  hasAdjustRole = false,
): boolean {
  const status = periodStatusFor(date, calendar);
  if (status === "open") return true;
  if (status === "soft_closed") return hasAdjustRole;
  return false;
}
