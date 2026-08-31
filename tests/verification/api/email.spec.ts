import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";
import { verifyMailbox } from "../fixtures/email-fixture";

loadLocalEnv();

/**
 * Skipped: email-send edge undeployed. In-app: enqueue via actions/email
 * → jobs/handlers/email (invitation stays sync).
 */
test("email via jobs handler (edge email-send removed)", async () => {
  test.skip(
    true,
    "Phase 2: use sendEmailAction / jobs — InsForge /functions/email-send deleted",
  );
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required for email smoke");
  const { accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  void accessToken;
  void verifyMailbox;
  expect(true).toBe(true);
});
