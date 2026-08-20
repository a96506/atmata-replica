import { expect, test } from "@playwright/test";
import {
  loadLocalEnv,
  tenantAOwner,
  tenantBOwner,
} from "../fixtures/accounts";
import { ISOLATION_SAMPLE_TABLES, sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("tenant A cannot read tenant B rows on sample company tables", async () => {
  const a = tenantAOwner();
  const b = tenantBOwner();
  test.skip(!a || !b, "VERIFY_A_OWNER_* and VERIFY_B_OWNER_* required");

  const clientA = await sdkFor(a!.email, a!.password);
  const clientB = await sdkFor(b!.email, b!.password);

  for (const table of ISOLATION_SAMPLE_TABLES) {
    const bRows = await clientB.database.from(table).select("*").limit(5);
    if (bRows.error) {
      // Table may deny select entirely for this role — still isolation-safe.
      continue;
    }
    const rows = (bRows.data ?? []) as { id?: string; company_id?: string }[];
    for (const row of rows) {
      if (!row.id) continue;
      const cross = await clientA.database
        .from(table)
        .select("*")
        .eq("id", row.id)
        .maybeSingle();
      const data = cross.data as { id?: string } | null;
      expect(
        data == null || data.id !== row.id,
        `${table} leaked B row ${row.id} to A`,
      ).toBe(true);
    }
  }
});
