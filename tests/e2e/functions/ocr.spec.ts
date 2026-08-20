import { expect, test } from "@playwright/test";
import { authenticatedClient } from "./helpers";

test("OCR does not expose a missing job", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("ocr-vendor-bill", {
    body: { jobId: Number.MAX_SAFE_INTEGER },
  });
  expect(error).not.toBeNull();
});

test("OCR validates job identifiers", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("ocr-vendor-bill", {
    body: { jobId: "1 OR 1=1" },
  });
  expect(error).not.toBeNull();
});
