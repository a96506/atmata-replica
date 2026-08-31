import "server-only";

import { startJobsWorker } from "@/lib/jobs/worker";
import { startSchedulesCron } from "@/lib/jobs/scheduler";

/**
 * Idempotent boot for the in-process jobs worker + schedules cron.
 *
 * Next standalone (`node server.js`) has historically skipped
 * `instrumentation.ts` register in some versions
 * (https://github.com/vercel/next.js/pull/89385). Railway healthchecks hit
 * `/api/health`, so that route also calls this as a reliable fallback.
 */
export function ensureJobsRuntime(): void {
  startJobsWorker();
  startSchedulesCron();
}
