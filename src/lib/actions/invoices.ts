"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createRequestId,
  KnownActionError,
  normalizeActionError,
} from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import { actionSchema } from "@/lib/actions/validation";
import {
  localeSchema,
  idempotencyKeySchema,
} from "@/lib/actions/validation/common";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";
import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertAllowedAttachmentMime } from "@/lib/actions/attachment-mime";
import {
  parseOcrExtraction,
  type OcrExtractionLine,
} from "@/lib/ocr/vendor-bill-extraction";
import type { DocumentProcessingJob } from "@/types/entities";

/**
 * AP invoice upload — two-step flow so the browser owns the file bytes and
 * the server owns the DB rows:
 *
 *   1. createOcrJob → queued document_processing_jobs row
 *   2. Browser uploads PDF to imports bucket
 *   3. linkOcrJobSource → source_url/key + attachments row
 *
 * OCR extract is worker-owned (`runOcrVendorBill` / job type `ocr`).
 * Approve/reject is this
 * write-path Server Action: single guarded transition (ILLEGAL_TRANSITION on
 * bad status), then create_vendor_bill (with source_ocr_job_id) + matched_doc_id
 * (or failed/REJECTED).
 *
 * @see https://dev.to/iurii_rogulia/b2b-quote-to-order-flow-in-nextjs-a-state-machine-that-doesnt-drift-1ijp
 * @see https://github.com/andermanasalb/invoicescan — transitions validate current state
 */

const APPROVABLE_STATUSES = new Set(["completed", "review_needed"]);

export async function createOcrJob(input: {
  fileName: string;
  mime: string;
  size: number;
}): Promise<{ jobId: number; companyId: string }> {
  assertAllowedAttachmentMime(input.mime);
  const insforge = await createInsForgeServerClient();

  const { data: cidRow, error: cidErr } =
    await insforge.database.rpc("my_company_id");
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
  assertAllowedAttachmentMime(input.mime);
  const insforge = await createInsForgeServerClient();

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

export async function getOcrJob(
  jobId: number,
): Promise<DocumentProcessingJob | null> {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return null;
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("document_processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("kind", "ocr_vendor_bill")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return camelize<DocumentProcessingJob>(data);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant-safe read by `public_id` (UUID). RLS scopes by company, so the UUID
 * is unguessable across tenants unlike the global integer identity `id`.
 */
export async function getOcrJobByPublicId(
  publicId: string,
): Promise<DocumentProcessingJob | null> {
  if (!UUID_RE.test(publicId)) return null;
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("document_processing_jobs")
    .select("*")
    .eq("public_id", publicId)
    .eq("kind", "ocr_vendor_bill")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return camelize<DocumentProcessingJob>(data);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveSupplierId(
  vendorName: string,
): Promise<{ id: string; name: string } | null> {
  const needle = normalizeName(vendorName);
  if (!needle) return null;
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("suppliers")
    .select("id, name")
    .eq("active", true);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  const exact = rows.find((row) => normalizeName(row.name) === needle);
  if (exact) return exact;
  const partial = rows.filter(
    (row) =>
      normalizeName(row.name).includes(needle) ||
      needle.includes(normalizeName(row.name)),
  );
  return partial.length === 1 ? partial[0]! : null;
}

async function resolveProductId(
  line: OcrExtractionLine,
): Promise<string | null> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("products")
    .select("id, sku, name, purchasable")
    .eq("purchasable", true);
  if (error) throw error;
  const products = (data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    purchasable: boolean;
  }>;
  if (products.length === 0) return null;

  const code = line.productCode?.trim().toLowerCase();
  if (code) {
    const bySku = products.find((p) => p.sku.toLowerCase() === code);
    if (bySku) return bySku.id;
  }

  const desc = normalizeName(line.description);
  const exactName = products.find((p) => normalizeName(p.name) === desc);
  if (exactName) return exactName.id;

  const skuInDesc = products.find((p) => desc.includes(p.sku.toLowerCase()));
  if (skuInDesc) return skuInDesc.id;

  const nameHit = products.filter(
    (p) =>
      desc.includes(normalizeName(p.name)) ||
      normalizeName(p.name).includes(desc),
  );
  return nameHit.length === 1 ? nameHit[0]!.id : null;
}

export type OcrApproveReadiness = {
  canApprove: boolean;
  blockedReason: string | null;
  supplierId: string | null;
  supplierName: string | null;
};

export async function getOcrApproveReadiness(
  job: DocumentProcessingJob,
): Promise<OcrApproveReadiness> {
  if (job.matchedDocId) {
    return {
      canApprove: false,
      blockedReason: "Already approved — vendor bill already linked.",
      supplierId: null,
      supplierName: null,
    };
  }
  if (!APPROVABLE_STATUSES.has(job.status)) {
    return {
      canApprove: false,
      blockedReason: `Cannot approve while status is "${job.status}".`,
      supplierId: null,
      supplierName: null,
    };
  }

  const parsed = parseOcrExtraction(job.extraction);
  if (!parsed.vendor || !parsed.invoiceNumber || !parsed.invoiceDate) {
    return {
      canApprove: false,
      blockedReason:
        "Extraction missing vendor, invoice number, or invoice date.",
      supplierId: null,
      supplierName: null,
    };
  }
  if (parsed.lineItems.length === 0) {
    return {
      canApprove: false,
      blockedReason: "Extraction has no line items.",
      supplierId: null,
      supplierName: null,
    };
  }

  const supplier = await resolveSupplierId(parsed.vendor);
  if (!supplier) {
    return {
      canApprove: false,
      blockedReason: `No unique active supplier match for "${parsed.vendor}".`,
      supplierId: null,
      supplierName: null,
    };
  }

  for (const [i, line] of parsed.lineItems.entries()) {
    const productId = await resolveProductId(line);
    if (!productId) {
      return {
        canApprove: false,
        blockedReason: `No unique purchasable product match for line ${i + 1}: "${line.description}".`,
        supplierId: supplier.id,
        supplierName: supplier.name,
      };
    }
  }

  return {
    canApprove: true,
    blockedReason: null,
    supplierId: supplier.id,
    supplierName: supplier.name,
  };
}

const ocrDecisionSchema = actionSchema({
  locale: localeSchema,
  jobId: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

function revalidateOcrPaths(
  locale: "en" | "ar",
  publicId: string,
  billId?: string,
) {
  revalidatePath(`/${locale}/accounting/invoices`);
  revalidatePath(`/accounting/invoices`);
  revalidatePath(`/${locale}/accounting/invoices/${publicId}`);
  revalidatePath(`/accounting/invoices/${publicId}`);
  if (billId) {
    revalidateDocumentPaths(locale, "vendor_bill", billId);
  }
}

/**
 * Approve OCR extraction → create draft vendor_bill via write RPC (sets
 * source_ocr_job_id), then matched_doc_id. Illegal job status →
 * ILLEGAL_TRANSITION (409-class).
 */
export async function approveOcrJobAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult & { jobId: number }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(ocrDecisionSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const job = await getOcrJob(parsed.data.jobId);
    if (!job) {
      throw new KnownActionError("NOT_FOUND");
    }
    if (job.matchedDocId) {
      throw new KnownActionError("ILLEGAL_TRANSITION");
    }
    if (!APPROVABLE_STATUSES.has(job.status)) {
      throw new KnownActionError("ILLEGAL_TRANSITION");
    }

    const readiness = await getOcrApproveReadiness(job);
    if (!readiness.canApprove || !readiness.supplierId) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          messageKey: "errors.validation",
          requestId,
          retryable: false,
          fieldErrors: {
            approve: [readiness.blockedReason ?? "Cannot approve this job."],
          },
        },
      };
    }

    const extraction = parseOcrExtraction(job.extraction);
    const lines = [];
    for (const line of extraction.lineItems) {
      const productId = await resolveProductId(line);
      if (!productId) {
        throw new KnownActionError("VALIDATION", {
          fieldErrors: {
            lines: [`No product match for "${line.description}"`],
          },
        });
      }
      lines.push({
        productId,
        description: line.description,
        qty: line.quantity,
        unitPrice: line.unitPrice,
      });
    }

    const dueDate =
      /^\d{4}-\d{2}-\d{2}$/.test(extraction.dueDate) &&
      extraction.dueDate >= extraction.invoiceDate
        ? extraction.dueDate
        : extraction.invoiceDate;

    const data = await callWriteRpc("create_vendor_bill", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: "save_draft",
      p_header: {
        supplierId: readiness.supplierId,
        invoiceNumber: extraction.invoiceNumber,
        date: extraction.invoiceDate,
        dueDate,
        currency: extraction.currency || "KWD",
      },
      p_lines: lines,
      p_source: null,
      p_source_ocr_job_id: job.id,
    });

    const insforge = await createInsForgeServerClient();
    const { data: linked, error: linkErr } = await insforge.database
      .from("document_processing_jobs")
      .update({ matched_doc_id: data.id })
      .eq("id", job.id)
      .in("status", ["completed", "review_needed"])
      .is("matched_doc_id", null)
      .select("id")
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!linked) {
      const fresh = await getOcrJob(job.id);
      if (fresh?.matchedDocId && fresh.matchedDocId !== data.id) {
        throw new KnownActionError("CONFLICT");
      }
    }

    if (job.sourceAttachmentId) {
      await insforge.database
        .from("attachments")
        .update({ doc_id: data.id })
        .eq("id", job.sourceAttachmentId)
        .is("doc_id", null);
      // Best-effort: record an attachment_added audit event now that the
      // uploaded file is linked to a concrete vendor_bill. Defensive —
      // survives when the change-detail migration has not landed yet.
      try {
        const { recordAttachmentAddedEvent } = await import(
          "@/lib/actions/audit"
        );
        await recordAttachmentAddedEvent({
          docType: "vendor_bill",
          docId: data.id,
          attachmentId: job.sourceAttachmentId,
          key: job.sourceKey ?? "",
          name: job.fileName ?? null,
        });
      } catch {
        /* audit is best-effort */
      }
    }

    revalidateOcrPaths(parsed.data.locale, job.publicId, data.id);
    return { ok: true, data: { ...data, jobId: job.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

/** Reject OCR extraction → terminal failed status with REJECTED reason. */
export async function rejectOcrJobAction(
  input: unknown,
): Promise<ActionResult<{ jobId: number; status: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(ocrDecisionSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const job = await getOcrJob(parsed.data.jobId);
    if (!job) {
      throw new KnownActionError("NOT_FOUND");
    }
    if (job.matchedDocId) {
      throw new KnownActionError("ILLEGAL_TRANSITION");
    }
    if (!APPROVABLE_STATUSES.has(job.status)) {
      throw new KnownActionError("ILLEGAL_TRANSITION");
    }

    const reason = (parsed.data.reason ?? "REJECTED").slice(0, 80);
    const insforge = await createInsForgeServerClient();
    const { data: updated, error } = await insforge.database
      .from("document_processing_jobs")
      .update({ status: "failed", error: reason })
      .eq("id", job.id)
      .in("status", ["completed", "review_needed"])
      .is("matched_doc_id", null)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new KnownActionError("ILLEGAL_TRANSITION");
    }

    revalidateOcrPaths(parsed.data.locale, job.publicId);
    return {
      ok: true,
      data: { jobId: job.id, status: (updated as { status: string }).status },
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
