import "server-only";

import { createInsForgeAdminClient } from "@/lib/insforge/server";
import { getHandler } from "@/lib/jobs/handlers";
import type { JobRow, JobType } from "@/lib/jobs/types";
import { isJobType } from "@/lib/jobs/types";

const POLL_MS = 8_000;

type JobsWorkerGlobal = typeof globalThis & {
  __atmataJobsWorkerStarted?: boolean;
  __atmataJobsKick?: () => void;
};

function workerEnabled(): boolean {
  return process.env.JOBS_WORKER_ENABLED !== "false";
}

function workerId(): string {
  return (
    process.env.RAILWAY_REPLICA_ID ??
    process.env.HOSTNAME ??
    `next-${process.pid}`
  );
}

function asJobRow(data: unknown): JobRow | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.type !== "string") return null;
  if (!isJobType(r.type)) return null;
  return row as JobRow;
}

async function claimOne(
  client: ReturnType<typeof createInsForgeAdminClient>,
): Promise<JobRow | null> {
  const { data, error } = await client.database.rpc("claim_job", {
    p_worker_id: workerId(),
  });
  if (error) {
    console.error("[jobs-worker] claim_job failed", error.message);
    return null;
  }
  return asJobRow(data);
}

async function completeOne(
  client: ReturnType<typeof createInsForgeAdminClient>,
  jobId: string,
  err?: string,
): Promise<void> {
  const args: Record<string, unknown> = { p_job_id: jobId };
  if (err != null) args.p_error = err;
  const { error } = await client.database.rpc("complete_job", args);
  if (error) {
    console.error("[jobs-worker] complete_job failed", error.message);
  }
}

async function processOne(
  client: ReturnType<typeof createInsForgeAdminClient>,
): Promise<boolean> {
  const job = await claimOne(client);
  if (!job) return false;

  const type = job.type as JobType;
  try {
    const handler = getHandler(type);
    await handler(job);
    await completeOne(client, job.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[jobs-worker] handler failed", { id: job.id, type, message });
    await completeOne(client, job.id, message);
  }
  return true;
}

async function drain(
  client: ReturnType<typeof createInsForgeAdminClient>,
): Promise<void> {
  // Process a burst so realtime wakes don't leave a long backlog.
  for (let i = 0; i < 20; i += 1) {
    const did = await processOne(client);
    if (!did) break;
  }
}

/**
 * Start the in-process jobs worker (idempotent).
 * Claims via claim_job (FOR UPDATE SKIP LOCKED), runs handlers, completes.
 * Wakes on realtime `job_enqueued` with an ~8s poll fallback.
 */
export function startJobsWorker(): void {
  if (!workerEnabled()) {
    console.info("[jobs-worker] disabled (JOBS_WORKER_ENABLED=false)");
    return;
  }

  const g = globalThis as JobsWorkerGlobal;
  if (g.__atmataJobsWorkerStarted) return;
  g.__atmataJobsWorkerStarted = true;

  let client: ReturnType<typeof createInsForgeAdminClient>;
  try {
    client = createInsForgeAdminClient();
  } catch (e) {
    console.error("[jobs-worker] admin client unavailable", e);
    g.__atmataJobsWorkerStarted = false;
    return;
  }

  let kicking = false;
  const kick = () => {
    if (kicking) return;
    kicking = true;
    void drain(client)
      .catch((err) => {
        console.error("[jobs-worker] drain error", err);
      })
      .finally(() => {
        kicking = false;
      });
  };
  g.__atmataJobsKick = kick;

  // Poll fallback every ~8s.
  setInterval(kick, POLL_MS);
  // Initial pass shortly after boot.
  setTimeout(kick, 1_500);

  void (async () => {
    try {
      await client.realtime.connect();
      const sub = await client.realtime.subscribe("jobs");
      if (!sub.ok) {
        console.warn(
          "[jobs-worker] realtime subscribe failed; polling only",
          sub.error?.message,
        );
        return;
      }
      client.realtime.on("job_enqueued", () => {
        kick();
      });
      console.info("[jobs-worker] realtime subscribed to jobs");
    } catch (e) {
      console.warn("[jobs-worker] realtime unavailable; polling only", e);
    }
  })();

  console.info("[jobs-worker] started", { workerId: workerId() });
}
