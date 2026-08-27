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
  // Credential/run-id guards: fail loudly when the harness isn't provisioned
  // instead of skipping (a skip hides a broken verification environment).
  if (!a || !b) {
    throw new Error(
      "VERIFY_A_OWNER / VERIFY_B_OWNER credentials required for search isolation",
    );
  }
  const runId = verifyRunId();
  if (!runId) {
    throw new Error("VERIFY_RUN_ID required for search isolation");
  }

  const clientA = await sdkFor(a!.email, a!.password);
  const sentinel = `TENANT_B_SECRET_${runId}`;
  const result = await clientA.database.rpc("search_all", {
    p_query: sentinel,
  });
  if (result.error) {
    // search_all RPC unavailable → fail loudly instead of skipping.
    throw new Error(
      `search_all unavailable (backend error): ${String(result.error)}`,
    );
  }
  const text = JSON.stringify(result.data ?? {}).toLowerCase();
  expect(text.includes(sentinel.toLowerCase())).toBe(false);
});
