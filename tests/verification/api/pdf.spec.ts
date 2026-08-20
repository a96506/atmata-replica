import { expect, test } from "@playwright/test";
import {
  demoOwner,
  loadLocalEnv,
  signInAccessToken,
} from "../fixtures/accounts";

loadLocalEnv();

test("pdf-gen preview returns base64 PDF", async () => {
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* required for pdf smoke");
  const { baseUrl, accessToken } = await signInAccessToken(
    account!.email,
    account!.password,
  );
  const response = await fetch(`${baseUrl}/functions/pdf-gen`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      docType: "quote",
      docId: "qt_1",
      locale: "en",
      mode: "preview",
    }),
  });
  expect(response.ok).toBe(true);
  const data = (await response.json()) as {
    mode?: string;
    contentType?: string;
    base64?: string;
  };
  expect(data.mode).toBe("preview");
  expect(data.contentType).toBe("application/pdf");
  const bytes = Buffer.from(data.base64 ?? "", "base64");
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
});
