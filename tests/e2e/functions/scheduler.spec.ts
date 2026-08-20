import { expect, test } from "@playwright/test";

import { loadLocalEnv } from "./helpers";

loadLocalEnv();

function schedulerUrl() {
  return (
    process.env.INSFORGE_SCHEDULER_URL ??
    "https://yfmw4i43-9rc.function2.insforge.app/erp-scheduler"
  );
}

test("erp-scheduler rejects missing cron token", async () => {
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

test("erp-scheduler rejects unknown jobs", async () => {
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
