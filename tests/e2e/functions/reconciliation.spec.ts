import { expect, test } from "@playwright/test";
import { authenticatedClient } from "./helpers";

test("reconciliation suggestions require a tenant-owned statement", async () => {
  const client = await authenticatedClient();
  const { error } = await client.functions.invoke("reconciliation-suggest", {
    body: { statementId: "missing-statement" },
  });
  expect(error).not.toBeNull();
});
