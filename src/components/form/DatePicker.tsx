"use client";

import { useId, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
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
  open: { label: "Period open", classes: "text-status-success-foreground" },
  soft_closed: {
    label: "Period soft-closed — only `period_adjust` role can post here",
    classes: "text-status-pending-foreground",
  },
  hard_closed: {
    label: "Period hard-closed — posting blocked",
    classes: "text-destructive",
  },
  no_period: {
    label: "No fiscal period covers this date",
    classes: "text-muted-foreground",
  },
};

/**
 * Date field that surfaces fiscal-period consequences inline, so users learn a
 * date is unpostable while choosing it rather than after submitting.
 */
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
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : null;
  const selectedDate = parsed && isValid(parsed) ? parsed : undefined;
  const status = periodStatusFor(value);
  const hint = STATUS_HINT[status];
  const blocked =
    status === "hard_closed" || (status === "soft_closed" && !hasAdjustRole);

  return (
    <Field
      data-invalid={error || blocked ? true : undefined}
      data-disabled={disabled ? true : undefined}
    >
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" *"}
          </span>
        ) : null}
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={!!error || blocked}
            className="w-full justify-between font-normal tabular-nums"
          >
            <span className={cn(!selectedDate && "text-muted-foreground")}>
              {selectedDate ? format(selectedDate, "dd MMM yyyy") : "Pick a date"}
            </span>
            <CalendarIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            autoFocus
            selected={selectedDate}
            defaultMonth={selectedDate}
            disabled={[
              ...(min ? [{ before: parseISO(min) }] : []),
              ...(max ? [{ after: parseISO(max) }] : []),
            ]}
            onSelect={(date) => {
              if (!date) return;
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {showPeriodHint && value ? (
        <FieldDescription className={hint.classes}>
          {hint.label}
        </FieldDescription>
      ) : null}
      {error ? (
        <FieldDescription className="text-destructive">{error}</FieldDescription>
      ) : null}
    </Field>
  );
}
