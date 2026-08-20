"use client";

import { useEffect, useState } from "react";
import { MoneyInput } from "./MoneyInput";
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
  const [suggested, setSuggested] = useState(1);

  useEffect(() => {
    if (docCurrency === baseCurrency) return;
    let cancelled = false;
    const params = new URLSearchParams({
      from: docCurrency,
      to: baseCurrency,
    });
    if (date) params.set("date", date);
    fetch(`/api/fx-rate?${params}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { rate?: number }) => {
        if (!cancelled) setSuggested(Number(body.rate) || 1);
      })
      .catch(() => {
        if (!cancelled) setSuggested(1);
      });
    return () => {
      cancelled = true;
    };
  }, [docCurrency, baseCurrency, date]);

  if (docCurrency === baseCurrency) return null;

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
