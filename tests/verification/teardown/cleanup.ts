import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Playwright teardown helper — delegates to scripts/verify/cleanup.mjs.
 * Safe no-op when database-after.json / VERIFY_RUN_ID are absent.
 */
export function cleanupVerifyRun() {
  if (!process.env.VERIFY_RUN_ID) {
    return { result: "skipped", reason: "VERIFY_RUN_ID unset" };
  }
  try {
    const stdout = execFileSync(
      "node",
      [resolve(process.cwd(), "scripts/verify/cleanup.mjs")],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );
    return JSON.parse(stdout);
  } catch (error) {
    const err = error as { stdout?: string; message?: string };
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through */
      }
    }
    throw new Error(err.message ?? String(error));
  }
}

export function authStatePath(name: string) {
  return resolve(process.cwd(), "verification/results/.auth", name);
}
