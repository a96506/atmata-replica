export const SCHEDULER_JOBS = [
  "fx_ingest",
  "aging_refresh",
  "stale_drafts",
  "month_end",
  "inventory_alerts",
  "depreciation",
] as const;

export type SchedulerJob = (typeof SCHEDULER_JOBS)[number];

export const KUWAIT_TZ = "Asia/Kuwait";

export function isSchedulerJob(value: string): value is SchedulerJob {
  return (SCHEDULER_JOBS as readonly string[]).includes(value);
}

export function kuwaitBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KUWAIT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type ScheduleManifestEntry = {
  name: string;
  cron: string;
  kuwaitTime: string;
  job: SchedulerJob;
  body: { job: SchedulerJob };
};

/** GMT equivalents of Kuwait local time. Server timezone is GMT / UTC+0. */
export const SCHEDULE_MANIFEST: ScheduleManifestEntry[] = [
  {
    name: "erp-fx-daily",
    cron: "15 21 * * *",
    kuwaitTime: "00:15",
    job: "fx_ingest",
    body: { job: "fx_ingest" },
  },
  {
    name: "erp-fx-daily-retry",
    cron: "45 21 * * *",
    kuwaitTime: "00:45",
    job: "fx_ingest",
    body: { job: "fx_ingest" },
  },
  {
    name: "erp-aging-daily",
    cron: "0 22 * * *",
    kuwaitTime: "01:00",
    job: "aging_refresh",
    body: { job: "aging_refresh" },
  },
  {
    name: "erp-stale-drafts-daily",
    cron: "20 22 * * *",
    kuwaitTime: "01:20",
    job: "stale_drafts",
    body: { job: "stale_drafts" },
  },
  {
    name: "erp-month-end-daily",
    cron: "0 23 * * *",
    kuwaitTime: "02:00",
    job: "month_end",
    body: { job: "month_end" },
  },
  {
    name: "erp-depreciation-daily",
    cron: "30 23 * * *",
    kuwaitTime: "02:30",
    job: "depreciation",
    body: { job: "depreciation" },
  },
  {
    name: "erp-inventory-alerts-daily",
    cron: "0 3 * * *",
    kuwaitTime: "06:00",
    job: "inventory_alerts",
    body: { job: "inventory_alerts" },
  },
];

export const SCHEDULER_HEADERS = {
  Authorization: "Bearer ${{secrets.SCHEDULE_CRON_TOKEN}}",
  "Content-Type": "application/json",
} as const;

export const DEFAULT_SCHEDULER_URL =
  "https://yfmw4i43-9rc.function2.insforge.app/erp-scheduler";
