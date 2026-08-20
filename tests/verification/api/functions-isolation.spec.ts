import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { insforgeBaseUrl, loadLocalEnv } from "../fixtures/accounts";

loadLocalEnv();

test("anonymous function invoke returns 401", async () => {
  const baseUrl = insforgeBaseUrl();
  test.skip(!baseUrl, "InsForge URL missing");
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/verification/manifests/functions.json"),
      "utf8",
    ),
  ) as { functions: { slug: string }[] };

  for (const fn of manifest.functions) {
    const response = await fetch(`${baseUrl}/functions/${fn.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status, fn.slug).toBe(401);
  }
});
