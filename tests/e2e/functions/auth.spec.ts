import { test } from "@playwright/test";

/**
 * Phase 2 cleanup: InsForge edge functions were deleted.
 * Auth coverage moved to Next routes (cookie session), not /functions/{slug}.
 * See: /api/pdf, /api/ai, /api/cron/erp; workers email/ocr/recon.
 */
test.describe.skip("edge function auth (undeployed)", () => {
  test("placeholder — use in-app route auth instead of /functions/{slug}", async () => {
    // intentionally empty
  });
});
