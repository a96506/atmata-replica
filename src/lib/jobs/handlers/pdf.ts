import "server-only";

import { createInsForgeAdminClient } from "@/lib/insforge/server";
import type { JobRow } from "@/lib/jobs/types";
import {
  generatePdf,
  parsePdfRequest,
  type PdfClient,
} from "@/lib/services/pdf-gen";

/**
 * Heavy PDF jobs (optional enqueue path).
 * Payload must match PdfRequest fields from the route/action.
 * Uses the admin client; company scope is enforced by job.company_id
 * and by generatePdf data fetches (RLS bypassed — verify company_id match).
 */
export async function handlePdfJob(job: JobRow): Promise<void> {
  const body = parsePdfRequest(job.payload);
  if (!body) {
    throw new Error("VALIDATION: invalid pdf job payload");
  }

  const admin = createInsForgeAdminClient() as unknown as PdfClient;
  const result = await generatePdf(body, admin, { requireUser: false });

  // Persist result pointer on the job row for callers that poll.
  // jobs table has no result column — write last_error-free done only.
  // Callers that need the URL should use sync generatePdf (day-one UI path).
  if (result.mode === "save") {
    console.info("[jobs-pdf] saved", {
      jobId: job.id,
      attachmentId: result.attachmentId,
      companyId: job.company_id,
    });
  }
}
