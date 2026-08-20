import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("schema-contract.sql and company_table_manifest migration exist", () => {
  const schemaSql = resolve(process.cwd(), "scripts/verify/schema-contract.sql");
  const platformAdmin = resolve(
    process.cwd(),
    "migrations/20260815153000_platform-admin.sql",
  );
  expect(existsSync(schemaSql)).toBe(true);
  expect(existsSync(platformAdmin)).toBe(true);
  const sql = readFileSync(platformAdmin, "utf8");
  expect(sql).toContain("company_table_manifest");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.company_table_manifest");
});

test("public-tables manifest lists 87 company-owned tables", () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/verification/manifests/public-tables.json"),
      "utf8",
    ),
  ) as {
    expectedCompanyOwnedCount: number;
    tables: { classification: string }[];
  };
  const owned = manifest.tables.filter((t) => t.classification === "company-owned");
  expect(manifest.expectedCompanyOwnedCount).toBe(87);
  expect(owned.length).toBe(87);
});
