import { test as setup } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadLocalEnv, verifyRunId } from "../fixtures/accounts";

loadLocalEnv();

setup("branch guard", async () => {
  setup.skip(!verifyRunId(), "VERIFY_RUN_ID not set — skipping guard setup");
  try {
    execFileSync("node", [resolve(process.cwd(), "scripts/verify/branch-guard.mjs")], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(
      `branch-guard failed:\n${err.stderr ?? ""}\n${err.stdout ?? err.message ?? error}`,
    );
  }
});
