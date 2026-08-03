"use client";

import type { ReactNode } from "react";
import { FISCAL_PERIODS } from "@/mocks/seed/master";
import { useSession } from "@/lib/session";
import type { PeriodStatus } from "@/types";

function periodStatusFor(dateStr: string): PeriodStatus {
  if (!dateStr) return "no_period";
  const ts = new Date(dateStr).getTime();
  for (const p of FISCAL_PERIODS) {
    if (ts >= new Date(p.start).getTime() && ts <= new Date(p.end).getTime()) {
      return p.status;
    }
  }
  return "no_period";
}

/**
 * Wraps a Post button. Renders the button only when the period for `date`
 * permits posting under the current role. Otherwise renders a disabled
 * fallback with a tooltip-style reason.
 */
export function PeriodGate({
  date,
  children,
  fallbackLabel = "Post",
}: {
  date: string;
  children: ReactNode;
  fallbackLabel?: string;
}) {
  const { role } = useSession();
  const status = periodStatusFor(date);
  const hasAdjust = role === "admin" || role === "period_adjust";
  const allowed =
    status === "open" || (status === "soft_closed" && hasAdjust);

  if (allowed) return <>{children}</>;

  const reason =
    status === "hard_closed"
      ? "Period hard-closed — posting blocked. Re-date to the next open period."
      : status === "soft_closed"
        ? "Period soft-closed — only the `period_adjust` role can post here."
        : "Selected date is not covered by any fiscal period.";

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled
        title={reason}
        className="cursor-not-allowed rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground"
      >
        {fallbackLabel}
      </button>
      <div className="max-w-xs text-xs text-status-pending-foreground">{reason}</div>
    </div>
  );
}
