import { expect, test } from "@playwright/test";
import {
  loadLocalEnv,
  tenantAOwner,
  tenantBOwner,
  verifyRunId,
} from "../fixtures/accounts";
import { sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

test("storage isolation A vs B", async () => {
  const a = tenantAOwner();
  const b = tenantBOwner();
  test.skip(!a || !b, "VERIFY_A/B_OWNER credentials required");
  test.skip(!verifyRunId(), "VERIFY_RUN_ID required for storage keys");

  const clientA = await sdkFor(a!.email, a!.password);
  const clientB = await sdkFor(b!.email, b!.password);

  const companyA = await clientA.database.rpc("my_company_id", {});
  const companyId = companyA.data as string | null;
  test.skip(!companyId || companyA.error, "Tenant A my_company_id unavailable");
  test.skip(companyId === "co_1", "refusing storage probe on co_1");

  // Storage RLS: first path segment must equal my_company_id().
  const key = `${companyId}/${verifyRunId()}/storage-a.txt`;
  const buckets = ["documents", "imports"] as const;
  let uploaded = false;
  let lastError = "";

  for (const bucket of buckets) {
    const result = await clientA.storage.from(bucket).upload(
      key,
      new Blob(["verify-a"], { type: "text/plain" }),
    );
    if (!result.error) {
      uploaded = true;
      const foreign = await clientB.storage.from(bucket).download(key);
      expect(foreign.error || !foreign.data).toBeTruthy();
      break;
    }
    lastError = result.error.message ?? String(result.error);
  }

  expect(
    uploaded,
    `no writable private bucket for isolation probe (last: ${lastError})`,
  ).toBe(true);
});
