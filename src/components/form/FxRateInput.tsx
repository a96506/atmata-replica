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
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
      <div className="text-xs font-semibold text-sky-900">
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
          <div className="text-xs font-medium text-slate-700">Suggested</div>
          <button
            type="button"
            onClick={() => onRateChange(suggested)}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm hover:bg-slate-50"
          >
            {suggested.toFixed(4)}
            <span className="ml-2 text-xs text-slate-500">use</span>
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-slate-700">Converted</div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-right text-sm font-semibold tabular-nums">
            {formatMoney(converted, baseCurrency)}
          </div>
        </div>
      </div>
    </div>
  );
}
