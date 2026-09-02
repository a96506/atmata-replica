import type { Role } from "@/types";

/**
 * UI/TS write-capability authority. SQL `write_capability_roles()` is the
 * runtime enforcement mirror — keep CASE arms in sync via capabilities.test.ts.
 *
 * Sync sources:
 * - migrations/20260815155000_write-command-foundation.sql
 * - sales_rep arm + assert_write_capability_any (dedicated migration)
 */

export type WriteCapability =
  | "buyer"
  | "warehouse"
  | "ap_clerk"
  | "ar_clerk"
  | "accountant"
  | "approver"
  | "sales_rep"
  | "admin";

export const WRITE_CAPABILITIES = {
  buyer: ["buyer", "admin"],
  warehouse: ["warehouse", "admin"],
  ap_clerk: ["ap_clerk", "admin"],
  ar_clerk: ["ar_clerk", "admin"],
  accountant: ["accountant", "admin"],
  approver: ["approver", "admin"],
  sales_rep: ["sales_rep", "admin"],
  admin: ["admin"],
} as const satisfies Record<WriteCapability, readonly Role[]>;

/**
 * Create / award RPCs used by PermissionGates and form CTAs.
 * Dual-capability ops use an array (OR): any matching capability grants access.
 */
export type OperationKey =
  | "create_quote"
  | "create_sales_order"
  | "create_customer_invoice"
  | "create_customer_receipt"
  | "apply_credit_to_invoice"
  | "create_delivery_note"
  | "create_customer_return"
  | "create_purchase_order"
  | "create_purchase_requisition"
  | "create_rfq"
  | "award_rfq"
  | "create_vendor_bill"
  | "create_vendor_payment"
  | "create_goods_receipt"
  | "create_vendor_return"
  | "create_stock_adjustment"
  | "create_internal_transfer"
  | "create_journal_entry"
  | "create_supplier"
  | "create_customer"
  | "create_opportunity"
  | "update_opportunity"
  | "delete_opportunity"
  | "create_product"
  | "create_warehouse"
  | "create_location"
  | "create_price_list"
  | "create_tax_code"
  | "create_fx_rate"
  | "create_currency"
  | "create_account"
  | "create_bank_account"
  | "create_approval_rule"
  | "update_company"
  | "manage_fiscal_period";

export const OPERATIONS = {
  // Dual: sales_rep OR ar_clerk (SQL: assert_write_capability_any)
  create_quote: ["sales_rep", "ar_clerk"],
  create_sales_order: ["sales_rep", "ar_clerk"],
  create_customer_invoice: "ar_clerk",
  create_customer_receipt: "ar_clerk",
  apply_credit_to_invoice: "ar_clerk",
  // RPC assert_write_capability('warehouse') — not ar_clerk (plan table typo)
  create_delivery_note: "warehouse",
  create_customer_return: "warehouse",
  create_purchase_order: "buyer",
  create_purchase_requisition: "buyer",
  create_rfq: "buyer",
  award_rfq: "buyer",
  create_vendor_bill: "ap_clerk",
  create_vendor_payment: "ap_clerk",
  create_goods_receipt: "warehouse",
  create_vendor_return: "warehouse",
  create_stock_adjustment: "warehouse",
  create_internal_transfer: "warehouse",
  create_journal_entry: "accountant",
  // Master data UI gates (RLS still enforces writes)
  create_supplier: "ap_clerk",
  create_customer: "ar_clerk",
  create_opportunity: "ar_clerk",
  update_opportunity: "ar_clerk",
  delete_opportunity: "ar_clerk",
  create_product: "admin",
  create_warehouse: "admin",
  create_location: "admin",
  create_price_list: "ar_clerk",
  create_tax_code: "accountant",
  create_fx_rate: "accountant",
  create_currency: "accountant",
  create_account: "accountant",
  create_bank_account: "accountant",
  create_approval_rule: "admin",
  update_company: "admin",
  manage_fiscal_period: "accountant",
} as const satisfies Record<
  OperationKey,
  WriteCapability | readonly WriteCapability[]
>;

export function can(role: Role, capability: WriteCapability): boolean {
  return (WRITE_CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** True when any session role holds the capability (stacked roles). */
export function canAny(
  roles: readonly Role[],
  capability: WriteCapability,
): boolean {
  return roles.some((r) => can(r, capability));
}

export function rolesForCapability(cap: WriteCapability): Role[] {
  return [...WRITE_CAPABILITIES[cap]];
}

/** Union of roles across one or more capabilities (deduped, stable order). */
export function rolesForOperation(operation: OperationKey): Role[] {
  const mapped = OPERATIONS[operation];
  const caps: WriteCapability[] =
    typeof mapped === "string" ? [mapped] : [...mapped];
  const seen = new Set<Role>();
  const out: Role[] = [];
  for (const cap of caps) {
    for (const role of WRITE_CAPABILITIES[cap]) {
      if (seen.has(role)) continue;
      seen.add(role);
      out.push(role);
    }
  }
  return out;
}

/** True when any session role may perform the operation. */
export function canAnyOperation(
  roles: readonly Role[],
  operation: OperationKey,
): boolean {
  if (roles.includes("admin")) return true;
  const allowed = rolesForOperation(operation);
  return roles.some((r) => allowed.includes(r));
}
