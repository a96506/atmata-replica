import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatMoney } from "./money";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as KWD with 3 decimal places (Atmata default).
 * Delegates to `formatMoney`; kept for back-compat with existing call sites.
 */
export function formatKwd(amount: number, locale: "en" | "ar" = "en"): string {
  return formatMoney(amount, "KWD", locale);
}
