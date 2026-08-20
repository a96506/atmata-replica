import { expect, test } from "@playwright/test";
import { loadLocalEnv, tenantAViewer } from "../fixtures/accounts";
import { sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("viewer cannot post_document", async () => {
  const viewer = tenantAViewer();
  test.skip(!viewer, "VERIFY_A_VIEWER_* credentials required");

  const client = await sdkFor(viewer!.email, viewer!.password);
  const result = await client.database.rpc("post_document", {
    p_doc_type: "purchase_order",
    p_doc_id: "po_nonexistent_verify",
    p_idempotency_key: `verify-role-${Date.now()}`,
    p_expected_row_version: 1,
  });
  expect(result.error).toBeTruthy();
});
