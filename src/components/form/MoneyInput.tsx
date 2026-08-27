"use client";

import * as React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types";

const PRECISION: Record<Currency, number> = {
  KWD: 3,
  SAR: 2,
  AED: 2,
  USD: 2,
};

export type MoneyInputProps = {
  value: number;
  onChange: (value: number) => void;
  currency: Currency;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
  error?: string | null;
  className?: string;
};

/**
 * Currency-aware amount field. The currency code sits in a leading addon so
 * the number itself stays right-aligned and tabular for column scanning.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  label,
  required,
  disabled,
  readOnly,
  min = 0,
  error,
  className,
}: MoneyInputProps) {
  const id = React.useId();
  const decimals = PRECISION[currency];
  // Clamp to the currency's precision so the displayed, validated, and
  // submitted values all match — the server rejects >3dp for KWD.
  const clamp = React.useCallback(
    (n: number) => {
      if (!Number.isFinite(n)) return 0;
      const f = Math.pow(10, decimals);
      return Math.round((n + Number.EPSILON) * f) / f;
    },
    [decimals],
  );

  return (
    <Field
      className={cn(className)}
      data-invalid={error ? true : undefined}
      data-disabled={disabled ? true : undefined}
    >
      {label ? (
        <FieldLabel htmlFor={id}>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              {" *"}
            </span>
          ) : null}
        </FieldLabel>
      ) : null}

      <InputGroup>
        <InputGroupAddon>
          <span className="text-xs font-medium">{currency}</span>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          step={Math.pow(10, -decimals)}
          min={min}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const raw = Number.parseFloat(e.target.value);
            onChange(Number.isFinite(raw) ? raw : 0);
          }}
          // Select-all on focus so a pre-filled 0 clears on the first keystroke
          // (click behaves like Tab). Skipped for read-only/disabled controls.
          onFocus={(e) => {
            if (readOnly || disabled) return;
            e.currentTarget.select();
          }}
          // Clamp to currency precision on blur so display + validation match
          // the server's raw-value check (KWD = 3dp).
          onBlur={(e) => {
            if (readOnly || disabled) return;
            const raw = Number.parseFloat(e.target.value);
            if (!Number.isFinite(raw)) return;
            const clamped = clamp(raw);
            if (clamped !== raw) {
              e.target.value = String(clamped);
              onChange(clamped);
            } else if (clamped !== value) {
              onChange(clamped);
            }
          }}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={!!error}
          className="text-end tabular-nums"
        />
      </InputGroup>

      {error ? (
        <FieldDescription className="text-destructive">{error}</FieldDescription>
      ) : null}
    </Field>
  );
}
