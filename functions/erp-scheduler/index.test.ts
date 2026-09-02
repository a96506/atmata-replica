import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULER_URL,
  isSchedulerJob,
  kuwaitBusinessDate,
  SCHEDULE_MANIFEST,
  SCHEDULER_JOBS,
} from "@/lib/schedules/manifest";

describe("erp-scheduler contract", () => {
  // Reference-only edge source; live path is /api/cron/erp + in-app node-cron.
  it("keeps the schedule manifest aligned with in-app cron ownership", () => {
    expect(SCHEDULE_MANIFEST).toHaveLength(8);
    expect(SCHEDULER_JOBS).toEqual([
      "fx_ingest",
      "aging_refresh",
      "stale_drafts",
      "month_end",
      "inventory_alerts",
      "depreciation",
      "metrics_refresh",
    ]);
    expect(DEFAULT_SCHEDULER_URL).toBe("/api/cron/erp");
    expect(isSchedulerJob("fx_ingest")).toBe(true);
    expect(kuwaitBusinessDate(new Date("2026-08-20T21:00:00Z"))).toBe(
      "2026-08-21",
    );
  });
});
