import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";

loadLocalEnv();

test("ai-assistant rejects arbitrary mutation operations", async () => {
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required");
  const { baseUrl, accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  const response = await fetch(`${baseUrl}/functions/ai-assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "execute_mutation",
      locale: "en",
      message: "post this bill",
    }),
  });
  expect(response.ok).toBe(false);
});
