import { test } from "@playwright/test";

/**
 * Skipped: ai-assistant edge undeployed. In-app: POST /api/ai
 * + src/lib/services/ai-assistant.ts
 */
test.describe.skip("ai-assistant edge (folded into /api/ai)", () => {
  test("see /api/ai", async () => {});
});
