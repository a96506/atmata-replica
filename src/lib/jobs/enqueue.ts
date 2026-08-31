import "server-only";

import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { JobType } from "@/lib/jobs/types";

/** Accepts server or admin InsForge clients (rpc returns a thenable builder). */
type RpcClient = {
  database: {
    rpc: (
      name: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  };
};

export type EnqueueJobOptions = {
  companyId?: string;
  runAfter?: Date;
  client?: RpcClient;
};

/**
 * Enqueue a background job via public.enqueue_job.
 * Pass an admin client + companyId for service paths; omit companyId on
 * user sessions to use my_company_id(). Global erp fan-out may omit both
 * and the RPC falls back to the __platform__ carrier.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  opts?: EnqueueJobOptions,
): Promise<{ id: string }> {
  const client = opts?.client ?? (await createInsForgeServerClient());
  const args: Record<string, unknown> = {
    p_type: type,
    p_payload: payload ?? {},
  };
  if (opts?.companyId != null && opts.companyId !== "") {
    args.p_company_id = opts.companyId;
  }
  if (opts?.runAfter != null) {
    args.p_run_after = opts.runAfter.toISOString();
  }

  const { data, error } = await client.database.rpc("enqueue_job", args);
  if (error) {
    throw new Error(error.message ?? "enqueue_job failed");
  }
  const id = typeof data === "string" ? data : null;
  if (!id) {
    throw new Error("enqueue_job returned no id");
  }
  return { id };
}
