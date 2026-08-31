import { expect, test } from "@playwright/test";

import { loadLocalEnv } from "./helpers";

loadLocalEnv();

/**
 * Phase 2: erp-scheduler edge undeployed. Auth contract lives on Next /api/cron/erp.
 * Set APP_URL (or PLAYWRIGHT_BASE_URL) to the Railway/local Next origin.
 */
function schedulerUrl() {
  const origin =
    process.env.APP_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  test.skip(
    !origin,
    "APP_URL not set — in-app path is /api/cron/erp (edge erp-scheduler deleted).",
  );
  return `${origin!.replace(/\/$/, "")}/api/cron/erp`;
}

test("erp cron rejects missing cron token", async () => {
  const response = await fetch(schedulerUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job: "aging_refresh" }),
  });
  expect(response.status).toBe(401);
  const body = (await response.json()) as {
    error?: { code?: string; requestId?: string };
  };
  expect(body.error?.code).toBe("UNAUTHENTICATED");
  expect(body.error?.requestId).toEqual(expect.any(String));
});

test("erp cron rejects unknown jobs", async () => {
  const token = process.env.SCHEDULE_CRON_TOKEN;
  test.skip(!token, "SCHEDULE_CRON_TOKEN is not configured.");
  const response = await fetch(schedulerUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ job: "not-a-job" }),
  });
  expect(response.status).toBe(400);
});
