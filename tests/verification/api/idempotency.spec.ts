import { expect, test } from "@playwright/test";
import {
  loadLocalEnv,
  mutationAllowed,
  tenantAOwner,
  verifyRunId,
} from "../fixtures/accounts";
import { loadVerifyAWriteContext, sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("duplicate idempotency key does not create two write_commands", async () => {
  test.skip(!mutationAllowed(), "mutation mode required");
  const owner = tenantAOwner();
  const runId = verifyRunId();
  test.skip(!owner || !runId, "VERIFY_A_OWNER_* and VERIFY_RUN_ID required");

  const client = await sdkFor(owner!.email, owner!.password);
  const ctx = await loadVerifyAWriteContext(client);
  test.skip(
    !ctx,
    "VERIFY Tenant A missing seeded product VF-RM-01 — run npm run seed:verify-master-data",
  );

  const key = `verify-idem-${runId}`;
  const header = {
    neededBy: ctx!.neededBy,
    notes: `idempotency ${runId}`,
  };
  const lines = [
    {
      productId: ctx!.productId,
      description: "Idempotency probe line",
      qty: 1,
      unitPrice: 5,
      ...(ctx!.taxCodeId ? { taxCodeId: ctx!.taxCodeId } : {}),
    },
  ];

  const first = await client.database.rpc("create_purchase_requisition", {
    p_idempotency_key: key,
    p_intent: "save_draft",
    p_header: header,
    p_lines: lines,
    p_source: null,
  });
  const second = await client.database.rpc("create_purchase_requisition", {
    p_idempotency_key: key,
    p_intent: "save_draft",
    p_header: header,
    p_lines: lines,
    p_source: null,
  });

  expect(first.error, String(first.error)).toBeFalsy();
  expect(second.error, String(second.error)).toBeFalsy();

  const id1 =
    (first.data as { id?: string; documentId?: string } | null)?.id ??
    (first.data as { documentId?: string } | null)?.documentId;
  const id2 =
    (second.data as { id?: string; documentId?: string } | null)?.id ??
    (second.data as { documentId?: string } | null)?.documentId;
  expect(id1).toBeTruthy();
  expect(id2).toBe(id1);
});
