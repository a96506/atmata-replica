export const SCHEDULER_JOBS = [
  "fx_ingest",
  "aging_refresh",
  "stale_drafts",
  "month_end",
  "inventory_alerts",
  "depreciation",
  "metrics_refresh",
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
  {
    name: "erp-metrics-refresh-daily",
    cron: "0 2 * * *",
    kuwaitTime: "05:00",
    job: "metrics_refresh",
    body: { job: "metrics_refresh" },
  },
];

export const SCHEDULER_HEADERS = {
  Authorization: "Bearer ${{secrets.SCHEDULE_CRON_TOKEN}}",
  "Content-Type": "application/json",
} as const;

/** In-app HTTP kick (Railway). InsForge edge erp-scheduler was deleted in Phase 2. */
export const IN_APP_SCHEDULER_PATH = "/api/cron/erp";

/** @deprecated Use IN_APP_SCHEDULER_PATH; edge function deploy removed. */
export const DEFAULT_SCHEDULER_URL = IN_APP_SCHEDULER_PATH;

export const SCHEDULER_OWNERSHIP =
  "in-app node-cron + public.schedules; InsForge edge erp-scheduler undeployed";
