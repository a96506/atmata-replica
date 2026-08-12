"use client";

import { useId } from "react";
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
  min = 0,
  error,
  className,
}: MoneyInputProps) {
  const id = useId();
  const decimals = PRECISION[currency];

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
          disabled={disabled}
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
