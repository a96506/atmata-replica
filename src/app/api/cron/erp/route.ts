import { NextResponse } from "next/server";

import { enqueueJob } from "@/lib/jobs/enqueue";
import { runErpScheduledJob } from "@/lib/jobs/handlers/erp";
import { PLATFORM_JOBS_COMPANY_ID } from "@/lib/jobs/types";
import { createInsForgeAdminClient } from "@/lib/insforge/server";
import {
  isSchedulerJob,
  kuwaitBusinessDate,
} from "@/lib/schedules/manifest";

/**
 * Ops HTTP kick for ERP scheduled jobs during the Phase 2 transition.
 * Auth: Bearer SCHEDULE_CRON_TOKEN (same token formerly used by the edge erp-scheduler).
 *
 * Prefer enqueue so the in-process worker claims via SKIP LOCKED.
 * Set ERP_CRON_SYNC=1 to run the handler inline (debug / no worker).
 *
 * InsForge edge erp-scheduler was deleted in Phase 2. Keep InsForge platform
 * schedules inactive — in-app node-cron owns the cadence via public.schedules.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(req: Request): string {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function fail(status: number, code: string, requestId: string) {
  return NextResponse.json(
    {
      error: {
        code,
        messageKey:
          code === "UNAUTHENTICATED"
            ? "errors.unauthenticated"
            : code === "VALIDATION"
              ? "errors.validation"
              : "errors.internal",
        requestId,
        retryable: false,
      },
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const expected = process.env.SCHEDULE_CRON_TOKEN ?? "";
  const provided = bearerToken(req);
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return fail(401, "UNAUTHENTICATED", requestId);
  }

  let body: { job?: string; runKey?: string; scheduleName?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail(400, "VALIDATION", requestId);
  }

  const job = typeof body.job === "string" ? body.job : "";
  if (!isSchedulerJob(job)) return fail(400, "VALIDATION", requestId);
  const runKey =
    typeof body.runKey === "string" && body.runKey.trim()
      ? body.runKey.trim()
      : kuwaitBusinessDate();
  const scheduleName =
    typeof body.scheduleName === "string" ? body.scheduleName : undefined;

  const payload = { job, runKey, scheduleName };

  if (process.env.ERP_CRON_SYNC === "1") {
    try {
      const result = await runErpScheduledJob(payload);
      return NextResponse.json(
        { requestId, mode: "sync", ...result },
        { status: result.failed > 0 ? 500 : 200 },
      );
    } catch (error) {
      console.error("[api/cron/erp] sync failed", error);
      return fail(500, "INTERNAL", requestId);
    }
  }

  try {
    const admin = createInsForgeAdminClient();
    const { id } = await enqueueJob("erp", payload, {
      companyId: PLATFORM_JOBS_COMPANY_ID,
      client: admin,
    });
    return NextResponse.json(
      {
        requestId,
        mode: "enqueue",
        jobId: id,
        job,
        runKey,
        status: "queued",
      },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[api/cron/erp] enqueue failed", error);
    // Fallback when queue RPC / migration is not applied yet.
    try {
      const result = await runErpScheduledJob(payload);
      return NextResponse.json(
        { requestId, mode: "sync-fallback", ...result },
        { status: result.failed > 0 ? 500 : 200 },
      );
    } catch {
      return fail(500, "INTERNAL", requestId);
    }
  }
}
