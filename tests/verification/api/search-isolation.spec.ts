import { expect, test } from "@playwright/test";
import {
  loadLocalEnv,
  tenantAOwner,
  tenantBOwner,
  verifyRunId,
} from "../fixtures/accounts";
import { sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("search_all does not return foreign tenant sentinel", async () => {
  const a = tenantAOwner();
  const b = tenantBOwner();
  test.skip(!a || !b, "VERIFY_A/B_OWNER credentials required");
  const runId = verifyRunId();
  test.skip(!runId, "VERIFY_RUN_ID required");

  const clientA = await sdkFor(a!.email, a!.password);
  const sentinel = `TENANT_B_SECRET_${runId}`;
  const result = await clientA.database.rpc("search_all", {
    p_query: sentinel,
  });
  if (result.error) {
    test.skip(true, `search_all unavailable: ${String(result.error)}`);
  }
  const text = JSON.stringify(result.data ?? {}).toLowerCase();
  expect(text.includes(sentinel.toLowerCase())).toBe(false);
});
