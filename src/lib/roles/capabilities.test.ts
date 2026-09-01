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
        "award_rfq",
        "create_customer_invoice",
        "create_customer_receipt",
        "create_customer_return",
        "create_delivery_note",
        "create_goods_receipt",
        "create_internal_transfer",
        "create_journal_entry",
        "create_purchase_order",
        "create_purchase_requisition",
        "create_quote",
        "create_rfq",
        "create_sales_order",
        "create_stock_adjustment",
        "create_vendor_bill",
        "create_vendor_payment",
        "create_vendor_return",
      ].sort(),
    );
  });
});
