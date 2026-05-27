import type { Currency } from "@/types";

/**
 * Daily FX rate against the company base currency. UI displays this in
 * `<FxRateInput>` when doc currency differs from the active company base.
 * Real ERP backends rebuild this table from a market data feed.
 */
export type FxRate = {
  date: string;
  from: Currency;
  to: Currency;
  rate: number;
};

/** Static rates for 2026-05 — illustrative, not market-accurate. */
export const FX_RATES: FxRate[] = [
  { date: "2026-05-15", from: "USD", to: "KWD", rate: 0.307 },
  { date: "2026-05-15", from: "USD", to: "SAR", rate: 3.75 },
  { date: "2026-05-15", from: "USD", to: "AED", rate: 3.673 },
  { date: "2026-05-15", from: "KWD", to: "USD", rate: 3.258 },
  { date: "2026-05-15", from: "KWD", to: "SAR", rate: 12.215 },
  { date: "2026-05-15", from: "KWD", to: "AED", rate: 11.966 },
  { date: "2026-05-15", from: "SAR", to: "KWD", rate: 0.0819 },
  { date: "2026-05-15", from: "AED", to: "KWD", rate: 0.0836 },
];

export function getFxRate(from: Currency, to: Currency, date?: string): number {
  if (from === to) return 1;
  // Latest rate ≤ date
  const candidates = FX_RATES.filter(
    (r) => r.from === from && r.to === to && (!date || r.date <= date),
  ).sort((a, b) => b.date.localeCompare(a.date));
  return candidates[0]?.rate ?? 1;
}
