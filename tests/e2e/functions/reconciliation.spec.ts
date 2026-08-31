import { test } from "@playwright/test";

/**
 * Skipped: reconciliation-suggest edge undeployed. In-app: jobs/handlers/recon.ts
 */
test.describe.skip("reconciliation-suggest edge (folded into jobs/recon)", () => {
  test("see jobs/handlers/recon", async () => {});
});
