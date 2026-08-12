import type { Currency, LocaleCode } from "@/types";

const CURRENCY_LOCALE: Record<
  Currency,
  { en: string; ar: string; fractionDigits: number }
> = {
  KWD: { en: "en-KW", ar: "ar-KW", fractionDigits: 3 },
  SAR: { en: "en-SA", ar: "ar-SA", fractionDigits: 2 },
  AED: { en: "en-AE", ar: "ar-AE", fractionDigits: 2 },
  USD: { en: "en-US", ar: "ar-AE", fractionDigits: 2 },
};

export function formatMoney(
  amount: number,
  currency: Currency = "KWD",
  locale: LocaleCode = "en",
): string {
  const cfg = CURRENCY_LOCALE[currency];
  return new Intl.NumberFormat(cfg[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: cfg.fractionDigits,
    maximumFractionDigits: cfg.fractionDigits,
  }).format(amount);
}

export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^\d.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
