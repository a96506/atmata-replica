import { handleEmailJob } from "@/lib/jobs/handlers/email";
import { handleErpJob } from "@/lib/jobs/handlers/erp";
import { handleOcrJob } from "@/lib/jobs/handlers/ocr";
import { handlePdfJob } from "@/lib/jobs/handlers/pdf";
import { handleReconJob } from "@/lib/jobs/handlers/recon";
import type { JobRow, JobType } from "@/lib/jobs/types";

export type JobHandler = (job: JobRow) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

function stub(type: JobType): JobHandler {
  return async () => {
    throw new Error(`not implemented: ${type}`);
  };
}

/** Register or replace a handler for a job type. */
export function registerHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** Resolve the handler for a job type (stub if none registered). */
export function getHandler(type: JobType): JobHandler {
  return handlers.get(type) ?? stub(type);
}

registerHandler("email", handleEmailJob);
registerHandler("ocr", handleOcrJob);
registerHandler("recon", handleReconJob);
registerHandler("erp", handleErpJob);
registerHandler("pdf", handlePdfJob);
