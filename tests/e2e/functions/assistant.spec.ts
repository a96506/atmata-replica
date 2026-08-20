import { expect, test } from "@playwright/test";
import { authenticatedClient } from "./helpers";

test("assistant rejects unbounded chat input", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("ai-assistant", {
    body: {
      operation: "chat",
      locale: "en",
      message: "x".repeat(2_001),
    },
  });
  expect(error).not.toBeNull();
});

test("assistant rejects arbitrary operations", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("ai-assistant", {
    body: {
      operation: "execute_mutation",
      locale: "en",
      message: "post this bill",
    },
  });
  expect(error).not.toBeNull();
});
