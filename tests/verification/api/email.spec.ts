import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";
import { verifyMailbox } from "../fixtures/email-fixture";

loadLocalEnv();

test("email-send accepts quote_sent with idempotency key", async () => {
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required for email smoke");
  const { baseUrl, accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  const mailbox = verifyMailbox();
  const response = await fetch(`${baseUrl}/functions/email-send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: "quote_sent",
      docId: "qt_1",
      locale: "en",
      idempotencyKey: `${mailbox.idempotencyKey}-${Date.now()}`,
    }),
  });
  expect(response.ok).toBe(true);
  const data = (await response.json()) as {
    deliveryId?: string;
    status?: string;
  };
  expect(data.deliveryId).toEqual(expect.any(String));
});
