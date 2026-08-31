import { test } from "@playwright/test";

/**
 * Skipped: pdf-gen edge undeployed. In-app: POST /api/pdf (cookie session)
 * + src/lib/services/pdf-gen.ts
 */
test.describe.skip("pdf-gen edge (folded into /api/pdf)", () => {
  test("see /api/pdf", async () => {});
});
