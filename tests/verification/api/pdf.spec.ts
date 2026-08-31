import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";

loadLocalEnv();

/**
 * Skipped: pdf-gen edge undeployed. Smoke against Next POST /api/pdf
 * (cookie session) when browser/verify coverage is ready.
 */
test("pdf via /api/pdf (edge pdf-gen removed)", async () => {
  test.skip(
    true,
    "Phase 2: use APP_URL /api/pdf — InsForge /functions/pdf-gen deleted",
  );
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required for pdf smoke");
  const { accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  const appUrl = process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL;
  test.skip(!appUrl, "APP_URL required");
  void accessToken;
  expect(appUrl).toBeTruthy();
});
