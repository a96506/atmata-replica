"use client";

import { useId } from "react";
import { FISCAL_PERIODS } from "@/mocks/seed/master";
import type { PeriodStatus } from "@/types";

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  hasAdjustRole?: boolean;
  showPeriodHint?: boolean;
  error?: string | null;
};

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

const STATUS_HINT: Record<PeriodStatus, { label: string; classes: string }> = {
  open: { label: "Period open", classes: "text-emerald-700" },
  soft_closed: {
    label: "Period soft-closed — only `period_adjust` role can post here",
    classes: "text-amber-700",
  },
  hard_closed: {
    label: "Period hard-closed — posting blocked",
    classes: "text-red-700",
  },
  no_period: { label: "No fiscal period covers this date", classes: "text-slate-500" },
};

export function DatePicker({
  value,
  onChange,
  label,
  required,
  disabled,
  min,
  max,
  hasAdjustRole,
  showPeriodHint = true,
  error,
}: DatePickerProps) {
  const id = useId();
  const status = periodStatusFor(value);
  const hint = STATUS_HINT[status];
  const blocked =
    status === "hard_closed" ||
    (status === "soft_closed" && !hasAdjustRole);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        aria-invalid={!!error}
        className={
          "cursor-pointer rounded-md border bg-white px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 " +
          (error
            ? "border-red-400"
            : blocked
              ? "border-red-300"
              : status === "soft_closed"
                ? "border-amber-300"
                : "border-slate-300")
        }
      />
      {showPeriodHint && value ? (
        <div className={"text-xs " + hint.classes}>{hint.label}</div>
      ) : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
