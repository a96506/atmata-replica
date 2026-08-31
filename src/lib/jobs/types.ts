/** Job queue types — matches public.jobs. */

export const JOB_TYPES = ["email", "ocr", "recon", "erp", "pdf"] as const;

export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "pending" | "running" | "done" | "failed";

export type JobRecord = {
  id: string;
  companyId: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Snake_case row shape returned by claim_job / complete_job RPCs. */
export type JobRow = {
  id: string;
  company_id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Suspended carrier company for global (company_id NULL) schedule fan-out.
 * Erp handlers must skip this id and expand to active tenants.
 */
export const PLATFORM_JOBS_COMPANY_ID = "__platform__";

export function isJobType(value: string): value is JobType {
  return (JOB_TYPES as readonly string[]).includes(value);
}
