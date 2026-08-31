import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadLocalEnv } from "../fixtures/accounts";

loadLocalEnv();

/**
 * Phase 2: edge functions deleted. Manifest lists in-app paths only.
 * Do not hit InsForge /functions/{slug}.
 */
test("functions manifest has no required edge deploys", async () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/verification/manifests/functions.json"),
      "utf8",
    ),
  ) as {
    edgeFunctions: unknown[];
    inApp: { formerSlug: string; path: string }[];
  };

  expect(manifest.edgeFunctions).toEqual([]);
  expect(manifest.inApp.length).toBe(6);
  expect(manifest.inApp.map((row) => row.formerSlug).sort()).toEqual(
    [
      "ai-assistant",
      "email-send",
      "erp-scheduler",
      "ocr-vendor-bill",
      "pdf-gen",
      "reconciliation-suggest",
    ].sort(),
  );
});
