import { expect, test } from "@playwright/test";
import { loadLocalEnv, mutationAllowed, tenantAOwner } from "../fixtures/accounts";
import { sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("stale expected_row_version is rejected", async () => {
  test.skip(!mutationAllowed(), "mutation mode required");
  const owner = tenantAOwner();
  test.skip(!owner, "VERIFY_A_OWNER_* required");

  const client = await sdkFor(owner!.email, owner!.password);
  const docs = await client.database
    .from("purchase_orders")
    .select("id,row_version,state")
    .limit(1);
  if (docs.error || !Array.isArray(docs.data) || !docs.data.length) {
    test.skip(
      true,
      "no purchase_orders row — run npm run seed:verify-master-data",
    );
  }
  const row = (docs.data as { id: string; row_version: number }[])[0];
  const current = row.row_version ?? 1;
  const staleVersion = current === 1 ? 999 : current - 1;

  const stale = await client.database.rpc("transition_document", {
    p_doc_type: "po",
    p_doc_id: row.id,
    p_action: "submit",
    p_expected_row_version: staleVersion,
    p_idempotency_key: `verify-lock-${Date.now()}`,
    p_reason: null,
  });

  const errText = String(
    (stale.error as { message?: string } | null)?.message ??
      stale.error ??
      (stale.data as { error?: string } | null)?.error ??
      "",
  );

  if (!stale.error) {
    const data = stale.data as { ok?: boolean; error?: string } | null;
    expect(data?.ok === false || data?.error || /STALE/i.test(errText)).toBeTruthy();
  } else {
    expect(errText).toMatch(
      /WRITE:STALE_VERSION|STALE_VERSION|40001|expected_row_version/i,
    );
  }
});
