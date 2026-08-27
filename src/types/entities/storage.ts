/**
 * Storage entities — polymorphic attachments + OCR/ingest job queue.
 *
 * Backed by `public.attachments` and `public.document_processing_jobs` in
 * the InsForge migration `20260812151600_storage.sql`. Snake_case columns
 * are camelized at the edge by `src/lib/db/case.ts` (added in the `reads`
 * todo); these camelCase shapes are the UI contract.
 */

export type AttachmentBucket = "documents" | "imports";

export type Attachment = {
  id: string;
  companyId: string;
  docType: string;
  /** null while a pending OCR job has not yet produced a source document. */
  docId: string | null;
  bucket: AttachmentBucket;
  /** Storage object key — `<company_id>/<doc_type>/<doc_id>/<attachment_id>/<filename>`. */
  key: string;
  /** Signed URL returned by the upload. */
  url: string;
  mime: string | null;
  size: number | null;
  filename: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentProcessingJobKind =
  | "ocr_vendor_bill"
  | "csv_bank_statement";

export type DocumentProcessingJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "review_needed"
  | "failed";

export type DocumentProcessingJob = {
  id: number;
  /** Tenant-safe UUID used in public routes (unique per company). */
  publicId: string;
  companyId: string;
  kind: DocumentProcessingJobKind;
  sourceAttachmentId: string | null;
  sourceUrl: string | null;
  sourceKey: string | null;
  fileName: string;
  status: DocumentProcessingJobStatus;
  extraction: Record<string, unknown>;
  confidence: number | null;
  matchedDocId: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
