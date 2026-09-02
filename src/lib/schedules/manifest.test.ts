import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULER_URL,
  isSchedulerJob,
  kuwaitBusinessDate,
  SCHEDULE_MANIFEST,
  SCHEDULER_JOBS,
  SCHEDULER_HEADERS,
} from "./manifest";

describe("schedule manifest", () => {
  it("defines eight schedules and seven jobs", () => {
    expect(SCHEDULE_MANIFEST).toHaveLength(8);
    expect(new Set(SCHEDULER_JOBS).size).toBe(7);
    expect(new Set(SCHEDULE_MANIFEST.map((row) => row.name)).size).toBe(8);
    expect(new Set(SCHEDULE_MANIFEST.map((row) => row.job)).size).toBe(7);
  });

  it("uses the locked GMT cron expressions", () => {
    expect(
      Object.fromEntries(SCHEDULE_MANIFEST.map((row) => [row.name, row.cron])),
    ).toEqual({
      "erp-fx-daily": "15 21 * * *",
      "erp-fx-daily-retry": "45 21 * * *",
      "erp-aging-daily": "0 22 * * *",
      "erp-stale-drafts-daily": "20 22 * * *",
      "erp-month-end-daily": "0 23 * * *",
      "erp-depreciation-daily": "30 23 * * *",
      "erp-inventory-alerts-daily": "0 3 * * *",
      "erp-metrics-refresh-daily": "0 2 * * *",
    });
  });

  it("keeps schedule headers on the cron token only", () => {
    expect(SCHEDULER_HEADERS.Authorization).toBe(
      "Bearer ${{secrets.SCHEDULE_CRON_TOKEN}}",
    );
    expect(JSON.stringify(SCHEDULER_HEADERS)).not.toContain("API_KEY");
  });

  it("pins the in-app cron kick path", () => {
    expect(DEFAULT_SCHEDULER_URL).toBe("/api/cron/erp");
  });

  it("accepts only known jobs", () => {
    expect(isSchedulerJob("aging_refresh")).toBe(true);
    expect(isSchedulerJob("cleanup")).toBe(false);
  });

  it("formats the Kuwait business date as YYYY-MM-DD", () => {
    expect(kuwaitBusinessDate(new Date("2026-08-20T21:00:00Z"))).toBe(
      "2026-08-21",
    );
    expect(kuwaitBusinessDate(new Date("2026-08-20T20:59:00Z"))).toBe(
      "2026-08-20",
    );
  });
});
