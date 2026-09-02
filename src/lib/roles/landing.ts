import type { Role } from "@/types";

/** Desk roles — when multiple are held, first match in this order wins. */
const DESK_ROLE_PRECEDENCE: readonly Role[] = [
  "sales_rep",
  "ar_clerk",
  "ap_clerk",
  "buyer",
  "warehouse",
];

const LANDING_BY_ROLE: Partial<Record<Role, string>> = {
  approver: "/inbox",
  admin: "/dashboard",
  accountant: "/accounting/journal-entries",
  sales_rep: "/sales",
  ar_clerk: "/sales/invoices",
  ap_clerk: "/purchasing/bills",
  buyer: "/purchasing/purchase-orders",
  warehouse: "/inventory/stock-moves",
  viewer: "/dashboard",
};

/**
 * Resolve the primary persona from `roles[]`.
 * Precedence: admin > approver > desk roles > accountant > viewer — not roles[0].
 */
export function resolvePrimaryRole(roles: readonly Role[]): Role {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("approver")) return "approver";
  for (const desk of DESK_ROLE_PRECEDENCE) {
    if (roles.includes(desk)) return desk;
  }
  if (roles.includes("accountant")) return "accountant";
  if (roles.includes("viewer")) return "viewer";
  return roles[0] ?? "viewer";
}

/** Locale-agnostic post-login landing path for the given session roles. */
export function landingPathForRoles(roles: readonly Role[]): string {
  const primary = resolvePrimaryRole(roles);
  return LANDING_BY_ROLE[primary] ?? "/dashboard";
}
