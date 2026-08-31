import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";

loadLocalEnv();

/**
 * Skipped: ai-assistant edge undeployed. In-app: POST /api/ai
 */
test("ai via /api/ai (edge ai-assistant removed)", async () => {
  test.skip(
    true,
    "Phase 2: use APP_URL /api/ai — InsForge /functions/ai-assistant deleted",
  );
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required");
  const { accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  void accessToken;
  expect(true).toBe(true);
});
