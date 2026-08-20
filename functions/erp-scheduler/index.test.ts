import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULER_URL,
  isSchedulerJob,
  kuwaitBusinessDate,
  SCHEDULE_MANIFEST,
  SCHEDULER_JOBS,
} from "@/lib/schedules/manifest";

describe("erp-scheduler contract", () => {
  it("keeps the edge dispatcher aligned with the seven-schedule manifest", () => {
    expect(SCHEDULE_MANIFEST).toHaveLength(7);
    expect(SCHEDULER_JOBS).toEqual([
      "fx_ingest",
      "aging_refresh",
      "stale_drafts",
      "month_end",
      "inventory_alerts",
      "depreciation",
    ]);
    expect(DEFAULT_SCHEDULER_URL.endsWith("/erp-scheduler")).toBe(true);
    expect(isSchedulerJob("fx_ingest")).toBe(true);
    expect(kuwaitBusinessDate(new Date("2026-08-20T21:00:00Z"))).toBe(
      "2026-08-21",
    );
  });
});
