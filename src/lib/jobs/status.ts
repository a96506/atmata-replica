import "server-only";

import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { JobStatus } from "@/lib/jobs/types";

export type WaitForJobResult = {
  id: string;
  status: JobStatus;
  lastError: string | null;
};

/**
 * Poll a jobs row until terminal status or timeout.
 * Used when actions enqueue work the UI still needs to wait on.
 */
export async function waitForJob(
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<WaitForJobResult | null> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const intervalMs = opts.intervalMs ?? 750;
  const deadline = Date.now() + timeoutMs;
  const client = await createInsForgeServerClient();

  while (Date.now() < deadline) {
    const { data, error } = await client.database
      .from("jobs")
      .select("id, status, last_error")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const status = String(data.status) as JobStatus;
    if (status === "done" || status === "failed") {
      return {
        id: String(data.id),
        status,
        lastError:
          typeof data.last_error === "string" ? data.last_error : null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
