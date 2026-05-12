import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as KWD with 3 decimal places (Atmata default).
 * `ar` uses Arabic-Indic digits via ar-KW.
 */
export function formatKwd(amount: number, locale: "en" | "ar" = "en"): string {
  const intl = locale === "ar" ? "ar-KW" : "en-KW";
  return new Intl.NumberFormat(intl, {
    style: "currency",
    currency: "KWD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount);
}
