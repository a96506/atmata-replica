"use server";

import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { DocumentProcessingJob } from "@/types/entities";

/**
 * AP invoice upload — two-step flow so the browser owns the file bytes and
 * the server owns the DB rows:
 *
 *   1. createOcrJob({ fileName, mime, size }) → inserts a `document_processing_jobs`
 *      row with status='queued' and no source yet. Returns { jobId, companyId }.
 *   2. Browser uploads the PDF to the `imports` bucket with key
 *      `${companyId}/vendor_bills/${jobId}/${filename}` via createBrowserClient().
 *   3. linkOcrJobSource({ jobId, key, url }) → updates the job row with
 *      source_url/source_key and inserts a sibling `attachments` row
 *      (doc_type='vendor_bill', doc_id=null until the OCR function creates
 *      the vendor_bill and sets matched_doc_id).
 *
 * The OCR extraction edge function ships in the `functions` todo — storage
 * only stands up the queue.
 */

export async function createOcrJob(input: {
  fileName: string;
  mime: string;
  size: number;
}): Promise<{ jobId: number; companyId: string }> {
  const insforge = await createInsForgeServerClient();

  const { data: cidRow, error: cidErr } = await insforge.database.rpc("my_company_id");
  if (cidErr) throw new Error(cidErr.message);
  const companyId = cidRow as unknown as string;
  if (!companyId) throw new Error("no active company membership");

  const { data, error } = await insforge.database
    .from("document_processing_jobs")
    .insert([
      {
        kind: "ocr_vendor_bill",
        file_name: input.fileName,
        status: "queued",
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const jobId = Number((data as { id: number }).id);
  return { jobId, companyId };
}

export async function linkOcrJobSource(input: {
  jobId: number;
  key: string;
  url: string;
  mime: string;
  size: number;
  filename: string;
}): Promise<{ job: DocumentProcessingJob; attachmentId: string }> {
  const insforge = await createInsForgeServerClient();

  // Insert attachment first — RLS + CHECK enforce the company prefix on key.
  const { data: attRow, error: attErr } = await insforge.database
    .from("attachments")
    .insert([
      {
        doc_type: "vendor_bill",
        doc_id: null,
        bucket: "imports",
        key: input.key,
        url: input.url,
        mime: input.mime,
        size: input.size,
        filename: input.filename,
      },
    ])
    .select("id")
    .single();
  if (attErr) throw new Error(attErr.message);
  const attachmentId = (attRow as { id: string }).id;

  const { data: jobRow, error: jobErr } = await insforge.database
    .from("document_processing_jobs")
    .update({
      source_attachment_id: attachmentId,
      source_url: input.url,
      source_key: input.key,
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (jobErr) throw new Error(jobErr.message);

  return {
    job: camelize<DocumentProcessingJob>(jobRow),
    attachmentId,
  };
}

export async function listOcrJobs(): Promise<DocumentProcessingJob[]> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("document_processing_jobs")
    .select("*")
    .eq("kind", "ocr_vendor_bill")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return camelize<DocumentProcessingJob[]>(data ?? []);
}
