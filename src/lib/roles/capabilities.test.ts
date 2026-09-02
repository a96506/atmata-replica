import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WRITE_CAPABILITIES,
  OPERATIONS,
  can,
  rolesForOperation,
  type WriteCapability,
} from "./capabilities";

/**
 * Keep WRITE_CAPABILITIES in sync with SQL write_capability_roles() CASE arms:
 * - migrations/20260815155000_write-command-foundation.sql
 * - new sales_rep migration (WHEN 'sales_rep' + assert_write_capability_any)
 */

const MIGRATIONS_DIR = join(process.cwd(), "migrations");
const SRC_DIR = join(process.cwd(), "src");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(tsx?)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Keys passed to PermissionGate `operation=` or MasterCrud `writeOperation=`. */
function extractOperationKeysFromSource(): string[] {
  const keys = new Set<string>();
  const pattern = /(?:operation|writeOperation)=["']([^"']+)["']/g;
  for (const file of collectSourceFiles(SRC_DIR)) {
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(pattern)) {
      keys.add(m[1]!);
    }
  }
  return [...keys].sort();
}

/** Extract WHEN 'cap' arms from the latest write_capability_roles definition. */
function parseWriteCapabilityWhenArms(sql: string): string[] {
  const fnMatches = [
    ...sql.matchAll(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.write_capability_roles\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi,
    ),
  ];
  if (fnMatches.length === 0) return [];
  const body = fnMatches[fnMatches.length - 1]![1]!;
  return [...body.matchAll(/WHEN\s+'([^']+)'/gi)].map((m) => m[1]!);
}

function loadSqlWhenArms(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let arms: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const found = parseWriteCapabilityWhenArms(sql);
    if (found.length > 0) arms = found;
  }
  return arms;
}

describe("WRITE_CAPABILITIES desk roles", () => {
  it("includes sales_rep with admin fallback", () => {
    expect(WRITE_CAPABILITIES.sales_rep).toEqual(["sales_rep", "admin"]);
  });
});

describe("can() matrix", () => {
  it("allows sales_rep on create_quote (dual cap)", () => {
    expect(can("sales_rep", "sales_rep")).toBe(true);
    expect(rolesForOperation("create_quote")).toContain("sales_rep");
  });

  it("denies sales_rep on create_customer_invoice", () => {
    expect(can("sales_rep", "ar_clerk")).toBe(false);
    expect(rolesForOperation("create_customer_invoice")).not.toContain(
      "sales_rep",
    );
  });

  it("blocks accountant on create_customer_receipt and create_stock_adjustment", () => {
    expect(rolesForOperation("create_customer_receipt")).not.toContain(
      "accountant",
    );
    expect(rolesForOperation("create_stock_adjustment")).not.toContain(
      "accountant",
    );
    expect(can("accountant", "ar_clerk")).toBe(false);
    expect(can("accountant", "warehouse")).toBe(false);
  });

  it("allows ar_clerk to create quote via dual capability", () => {
    expect(rolesForOperation("create_quote")).toEqual(
      expect.arrayContaining(["sales_rep", "ar_clerk", "admin"]),
    );
    expect(can("ar_clerk", "ar_clerk")).toBe(true);
  });
});

/** Phase 1 acceptance matrix (docs/role-ux-plan.md) — gate-level smoke. */
function roleMay(role: string, operation: keyof typeof OPERATIONS): boolean {
  if (role === "admin") return true;
  return rolesForOperation(operation).includes(role as never);
}

describe("Phase 1 acceptance matrix (PermissionGate smoke)", () => {
  it("sales_rep: quote/SO yes; invoice/receipt/adjustment no", () => {
    expect(roleMay("sales_rep", "create_quote")).toBe(true);
    expect(roleMay("sales_rep", "create_sales_order")).toBe(true);
    expect(roleMay("sales_rep", "create_customer_invoice")).toBe(false);
    expect(roleMay("sales_rep", "create_customer_receipt")).toBe(false);
    expect(roleMay("sales_rep", "create_stock_adjustment")).toBe(false);
  });

  it("ar_clerk: quote/SO/invoice/receipt yes; PO/bill/adjustment no", () => {
    expect(roleMay("ar_clerk", "create_quote")).toBe(true);
    expect(roleMay("ar_clerk", "create_sales_order")).toBe(true);
    expect(roleMay("ar_clerk", "create_customer_invoice")).toBe(true);
    expect(roleMay("ar_clerk", "create_customer_receipt")).toBe(true);
    expect(roleMay("ar_clerk", "apply_credit_to_invoice")).toBe(true);
    expect(roleMay("ar_clerk", "create_purchase_order")).toBe(false);
    expect(roleMay("ar_clerk", "create_vendor_bill")).toBe(false);
    expect(roleMay("ar_clerk", "create_stock_adjustment")).toBe(false);
  });

  it("accountant: JE yes; receipt/adjustment no", () => {
    expect(roleMay("accountant", "create_journal_entry")).toBe(true);
    expect(roleMay("accountant", "create_customer_receipt")).toBe(false);
    expect(roleMay("accountant", "create_stock_adjustment")).toBe(false);
  });

  it("warehouse: adjustment/transfer/GRN yes; quote/bill no", () => {
    expect(roleMay("warehouse", "create_stock_adjustment")).toBe(true);
    expect(roleMay("warehouse", "create_internal_transfer")).toBe(true);
    expect(roleMay("warehouse", "create_goods_receipt")).toBe(true);
    expect(roleMay("warehouse", "create_delivery_note")).toBe(true);
    expect(roleMay("warehouse", "create_quote")).toBe(false);
    expect(roleMay("warehouse", "create_vendor_bill")).toBe(false);
  });

  it("viewer: denied on all create operations", () => {
    for (const op of Object.keys(OPERATIONS) as (keyof typeof OPERATIONS)[]) {
      expect(roleMay("viewer", op)).toBe(false);
    }
  });

  it("admin: allowed on all create operations", () => {
    for (const op of Object.keys(OPERATIONS) as (keyof typeof OPERATIONS)[]) {
      expect(roleMay("admin", op)).toBe(true);
    }
  });
});

/** Settings / master write ops (docs/role-ux-plan.md Phase 4). */
const SETTINGS_WRITE_OPS = [
  "create_supplier",
  "create_customer",
  "create_price_list",
  "create_product",
  "create_warehouse",
  "create_location",
  "create_tax_code",
  "create_fx_rate",
  "create_currency",
  "create_account",
  "create_bank_account",
  "create_approval_rule",
  "update_company",
  "manage_fiscal_period",
] as const satisfies readonly (keyof typeof OPERATIONS)[];

describe("Phase 4 settings matrix (MasterCrud / settings gates)", () => {
  it("viewer: denied all settings write operations", () => {
    for (const op of SETTINGS_WRITE_OPS) {
      expect(roleMay("viewer", op)).toBe(false);
    }
  });

  it("ap_clerk: create_supplier yes; create_customer no", () => {
    expect(roleMay("ap_clerk", "create_supplier")).toBe(true);
    expect(roleMay("ap_clerk", "create_customer")).toBe(false);
  });

  it("ar_clerk: create_customer + create_opportunity + create_price_list yes; create_supplier no", () => {
    expect(roleMay("ar_clerk", "create_customer")).toBe(true);
    expect(roleMay("ar_clerk", "create_opportunity")).toBe(true);
    expect(roleMay("ar_clerk", "update_opportunity")).toBe(true);
    expect(roleMay("ar_clerk", "delete_opportunity")).toBe(true);
    expect(roleMay("ar_clerk", "create_price_list")).toBe(true);
    expect(roleMay("ar_clerk", "create_supplier")).toBe(false);
  });

  it("accountant: tax/bank/coa/fiscal yes; approval-rule admin-only", () => {
    expect(roleMay("accountant", "create_tax_code")).toBe(true);
    expect(roleMay("accountant", "create_fx_rate")).toBe(true);
    expect(roleMay("accountant", "create_currency")).toBe(true);
    expect(roleMay("accountant", "create_account")).toBe(true);
    expect(roleMay("accountant", "create_bank_account")).toBe(true);
    expect(roleMay("accountant", "manage_fiscal_period")).toBe(true);
    expect(roleMay("accountant", "create_approval_rule")).toBe(false);
  });

  it("admin: allowed on all settings write operations", () => {
    for (const op of SETTINGS_WRITE_OPS) {
      expect(roleMay("admin", op)).toBe(true);
    }
  });
});

describe("WRITE_CAPABILITIES ↔ SQL WHEN arms", () => {
  it("matches write_capability_roles CASE arms (TS may lead with sales_rep)", () => {
    const sqlArms = loadSqlWhenArms();
    expect(sqlArms.length).toBeGreaterThan(0);

    const tsKeys = Object.keys(WRITE_CAPABILITIES) as WriteCapability[];

    // Every SQL arm must exist in TS.
    for (const arm of sqlArms) {
      expect(tsKeys).toContain(arm);
    }

    // Every TS key must appear in SQL (incl. sales_rep from 20260901140000_sales-rep-write-capability.sql).
    for (const key of tsKeys) {
      expect(sqlArms).toContain(key);
    }
  });

  it("exposes operations used by PermissionGates", () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual(
      [
        "apply_credit_to_invoice",
        "award_rfq",
        "create_account",
        "create_approval_rule",
        "create_bank_account",
        "create_currency",
        "create_customer",
        "create_customer_invoice",
        "create_customer_receipt",
        "create_customer_return",
        "create_delivery_note",
        "create_fx_rate",
        "create_goods_receipt",
        "create_internal_transfer",
        "create_journal_entry",
        "create_location",
        "create_opportunity",
        "create_price_list",
        "create_product",
        "create_purchase_order",
        "create_purchase_requisition",
        "create_quote",
        "create_rfq",
        "create_sales_order",
        "create_stock_adjustment",
        "create_supplier",
        "create_tax_code",
        "create_vendor_bill",
        "create_vendor_payment",
        "create_vendor_return",
        "create_warehouse",
        "delete_opportunity",
        "manage_fiscal_period",
        "update_company",
        "update_opportunity",
      ].sort(),
    );
  });

  it("every operation/writeOperation in src exists in OPERATIONS", () => {
    const used = extractOperationKeysFromSource();
    expect(used.length).toBeGreaterThan(0);
    const defined = Object.keys(OPERATIONS);
    for (const key of used) {
      expect(defined, `unknown OperationKey "${key}" in src`).toContain(key);
    }
  });

  it("master write ops map to desk capabilities", () => {
    expect(rolesForOperation("create_supplier")).toEqual(
      expect.arrayContaining(["ap_clerk", "admin"]),
    );
    expect(rolesForOperation("create_customer")).toEqual(
      expect.arrayContaining(["ar_clerk", "admin"]),
    );
    expect(rolesForOperation("create_price_list")).toEqual(
      expect.arrayContaining(["ar_clerk", "admin"]),
    );
    expect(rolesForOperation("create_product")).toEqual(["admin"]);
    expect(rolesForOperation("create_warehouse")).toEqual(["admin"]);
    expect(rolesForOperation("create_location")).toEqual(["admin"]);
  });
});
