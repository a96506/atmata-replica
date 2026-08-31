import { test } from "@playwright/test";

/**
 * Skipped: ocr-vendor-bill edge undeployed. In-app: jobs/handlers/ocr.ts
 */
test.describe.skip("ocr-vendor-bill edge (folded into jobs/ocr)", () => {
  test("see jobs/handlers/ocr", async () => {});
});
