import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = [
  "20260815150000_identity-invitation-hardening.sql",
  "20260815151000_functions-support.sql",
  "20260815152000_read-contracts.sql",
  "20260815153000_platform-admin.sql",
  "20260815154000_user-admin-hardening.sql",
  "20260815155000_write-command-foundation.sql",
  "20260815160000_p2p-write-rpcs.sql",
  "20260815161000_q2c-write-rpcs.sql",
  "20260815162000_inventory-gl-write-rpcs.sql",
  "20260815163000_operational-write-rpcs.sql",
  "20260815164000_scheduled-operations.sql",
  "20260820210445_doc-state-transitions-rls.sql",
];

test("required verification migrations exist", () => {
  const dir = resolve(process.cwd(), "migrations");
  for (const name of REQUIRED) {
    expect(existsSync(resolve(dir, name)), name).toBe(true);
  }
});
