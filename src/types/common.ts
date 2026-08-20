/**
 * Atmata frontend — shared scalar/enum types.
 *
 * This file is part of the typed contract the backend team will implement
 * against. Treat names as stable; coordinate before renaming.
 */

export type LocaleCode = "en" | "ar";

export type Currency = "KWD" | "SAR" | "AED" | "USD";

export type Money = {
  amount: number;
  currency: Currency;
};

export type ISO8601 = string;

export type TaxJurisdiction = "KW" | "SA" | "AE";

export type DocState =
  | "draft"
  | "pending"
  | "confirmed"
  | "posted"
  | "locked"
  | "archived"
  | "cancelled"
  // RFQ-specific
  | "sent"
  | "quotes_received"
  | "awarded"
  | "closed";

export type PeriodStatus = "open" | "soft_closed" | "hard_closed" | "no_period";

export type Role =
  | "admin"
  | "approver"
  | "ap_clerk"
  | "ar_clerk"
  | "warehouse"
  | "buyer"
  | "sales_rep"
  | "accountant"
  | "period_adjust"
  | "audit_unlock"
  | "viewer"
  /** Synthetic role used to render the AI co-pilot as a first-class actor. */
  | "ai_agent";

export const ALL_ROLES = [
  "admin",
  "approver",
  "ap_clerk",
  "ar_clerk",
  "warehouse",
  "buyer",
  "sales_rep",
  "accountant",
  "period_adjust",
  "audit_unlock",
  "viewer",
  "ai_agent",
] as const satisfies readonly Role[];

export const ASSIGNABLE_USER_ROLES = ALL_ROLES.filter(
  (role): role is Exclude<Role, "ai_agent"> => role !== "ai_agent",
);

export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number];

export type DocType =
  | "pr"
  | "rfq"
  | "po"
  | "grn"
  | "vendor_bill"
  | "vendor_payment"
  | "debit_note"
  | "vendor_return"
  | "opportunity"
  | "quote"
  | "so"
  | "dn"
  | "customer_invoice"
  | "customer_receipt"
  | "credit_note"
  | "customer_return"
  | "journal_entry"
  | "stock_move"
  | "stock_adjustment"
  | "internal_transfer";
