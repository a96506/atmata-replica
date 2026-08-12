"use client";

import { MoneyInput } from "./MoneyInput";
import { getFxRate } from "@/mocks/seed/fx";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/types";

export type FxRateInputProps = {
  docCurrency: Currency;
  baseCurrency: Currency;
  rate: number;
  onRateChange: (value: number) => void;
  amount: number;
  date?: string;
};

export function FxRateInput({
  docCurrency,
  baseCurrency,
  rate,
  onRateChange,
  amount,
  date,
}: FxRateInputProps) {
  if (docCurrency === baseCurrency) return null;

  const suggested = getFxRate(docCurrency, baseCurrency, date);
  const converted = amount * (rate || suggested);

  return (
    <div className="rounded-md border border-status-info-border bg-status-info-muted p-3">
      <div className="text-xs font-semibold text-status-info-foreground">
        FX rate · {docCurrency} → {baseCurrency}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyInput
          label={`Rate (${docCurrency} → ${baseCurrency})`}
          value={rate || suggested}
          onChange={onRateChange}
          currency={baseCurrency}
        />
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-foreground">Suggested</div>
          <button
            type="button"
            onClick={() => onRateChange(suggested)}
            className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-left text-sm hover:bg-muted"
          >
            {suggested.toFixed(4)}
            <span className="ml-2 text-xs text-muted-foreground">use</span>
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-foreground">Converted</div>
          <div className="rounded-md border border-border bg-card px-3 py-1.5 text-right text-sm font-semibold tabular-nums">
            {formatMoney(converted, baseCurrency)}
          </div>
        </div>
      </div>
    </div>
  );
}
