"use client";

import { useId } from "react";
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
    <div className={"flex flex-col gap-1 " + (className ?? "")}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-orange-500">
        <span className="flex items-center bg-slate-50 px-2 text-xs font-medium text-slate-600">
          {currency}
        </span>
        <input
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
          className="w-full px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
