import "server-only";

import cron from "node-cron";

import { createInsForgeAdminClient } from "@/lib/insforge/server";
import { enqueueJob } from "@/lib/jobs/enqueue";
import {
  PLATFORM_JOBS_COMPANY_ID,
  isJobType,
  type JobType,
} from "@/lib/jobs/types";
import { kuwaitBusinessDate } from "@/lib/schedules/manifest";

type SchedulesCronGlobal = typeof globalThis & {
  __atmataSchedulesCronStarted?: boolean;
};

type ScheduleRow = {
  id: string;
  company_id: string | null;
  name: string;
  job_type: string;
  cron_expr: string;
  timezone: string | null;
  payload: Record<string, unknown> | null;
  is_active: boolean;
};

function schedulesEnabled(): boolean {
  if (process.env.SCHEDULES_CRON_ENABLED === "false") return false;
  if (process.env.JOBS_WORKER_ENABLED === "false") return false;
  return true;
}

async function loadActiveSchedules(
  client: ReturnType<typeof createInsForgeAdminClient>,
): Promise<ScheduleRow[]> {
  const { data, error } = await client.database
    .from("schedules")
    .select(
      "id, company_id, name, job_type, cron_expr, timezone, payload, is_active",
    )
    .eq("is_active", true);

  if (error) {
    console.error("[schedules-cron] load failed", error.message);
    return [];
  }
  return (data ?? []) as ScheduleRow[];
}

async function tickSchedule(row: ScheduleRow): Promise<void> {
  if (!isJobType(row.job_type)) {
    console.error("[schedules-cron] invalid job_type", row.job_type, row.id);
    return;
  }
  const jobType = row.job_type as JobType;
  const basePayload =
    row.payload && typeof row.payload === "object" ? { ...row.payload } : {};

  // Global erp schedules: one fan-out job; erp handler expands per company.
  const payload: Record<string, unknown> = {
    ...basePayload,
    scheduleName: row.name,
  };
  if (jobType === "erp" && typeof payload.job !== "string") {
    console.warn("[schedules-cron] erp schedule missing payload.job", row.name);
  }
  // Idempotency key for run_scheduled_company_job (Kuwait business day).
  if (jobType === "erp" && (typeof payload.runKey !== "string" || !payload.runKey)) {
    payload.runKey = kuwaitBusinessDate();
  }

  const companyId =
    row.company_id != null && row.company_id !== ""
      ? row.company_id
      : PLATFORM_JOBS_COMPANY_ID;

  try {
    const admin = createInsForgeAdminClient();
    const { id } = await enqueueJob(jobType, payload, {
      companyId,
      client: admin,
    });
    await admin.database
      .from("schedules")
      .update({ last_enqueued_at: new Date().toISOString() })
      .eq("id", row.id);
    console.info("[schedules-cron] enqueued", {
      schedule: row.name,
      jobId: id,
      jobType,
    });
  } catch (e) {
    console.error("[schedules-cron] enqueue failed", row.name, e);
  }
}

/**
 * Thin in-process cron over public.schedules (boot load only).
 * Idempotent. Gated by SCHEDULES_CRON_ENABLED / JOBS_WORKER_ENABLED.
 */
export function startSchedulesCron(): void {
  if (!schedulesEnabled()) {
    console.info("[schedules-cron] disabled");
    return;
  }

  const g = globalThis as SchedulesCronGlobal;
  if (g.__atmataSchedulesCronStarted) return;
  g.__atmataSchedulesCronStarted = true;

  let client: ReturnType<typeof createInsForgeAdminClient>;
  try {
    client = createInsForgeAdminClient();
  } catch (e) {
    console.error("[schedules-cron] admin client unavailable", e);
    g.__atmataSchedulesCronStarted = false;
    return;
  }

  void (async () => {
    const rows = await loadActiveSchedules(client);
    for (const row of rows) {
      if (!cron.validate(row.cron_expr)) {
        console.error(
          "[schedules-cron] invalid cron_expr",
          row.cron_expr,
          row.name,
        );
        continue;
      }
      const timezone = row.timezone?.trim() || "UTC";
      cron.schedule(
        row.cron_expr,
        () => {
          void tickSchedule(row);
        },
        { timezone },
      );
      console.info("[schedules-cron] registered", {
        name: row.name,
        cron: row.cron_expr,
        timezone,
      });
    }
    console.info("[schedules-cron] started", { count: rows.length });
  })();
}
