import { expect, test } from "@playwright/test";
import { authenticatedClient } from "./helpers";

test("PDF preview is JSON/base64 and decodes to PDF", async () => {
  const client = await authenticatedClient();
  const { data, error } = await client.functions.invoke("pdf-gen", {
    body: {
      docType: "quote",
      docId: "qt_1",
      locale: "en",
      mode: "preview",
    },
  });
  expect(error).toBeNull();
  expect(data).toMatchObject({
    mode: "preview",
    contentType: "application/pdf",
  });
  const bytes = Buffer.from((data as { base64: string }).base64, "base64");
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1_000);
});

test("PDF rejects unknown dispatch identifiers", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("pdf-gen", {
    body: {
      docType: "not-a-table",
      docId: "qt_1",
      locale: "en",
      mode: "preview",
    },
  });
  expect(error).not.toBeNull();
});
