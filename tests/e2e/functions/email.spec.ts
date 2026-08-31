import { test } from "@playwright/test";

/**
 * Skipped: email-send edge undeployed. In-app: enqueue email job via
 * src/lib/actions/email.ts → src/lib/jobs/handlers/email.ts
 * (invitation path stays sync — do not break).
 */
test.describe.skip("email-send edge (folded into jobs/email)", () => {
  test("see jobs/handlers/email", async () => {});
});
