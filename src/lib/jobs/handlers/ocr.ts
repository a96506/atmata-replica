import "server-only";

import OpenAI from "openai";
import { createInsForgeAdminClient } from "@/lib/insforge/server";
import type { JobRow } from "@/lib/jobs/types";

type AdminClient = ReturnType<typeof createInsForgeAdminClient>;
type JobsClient = AdminClient;

export type OcrJobPayload = {
  jobId: number;
  companyId?: string;
  actorUserId?: string;
};

export type OcrRunResult = {
  jobId: number;
  status: string;
  confidence?: number;
};

export class OcrVendorBillError extends Error {
  constructor(
    readonly code:
      | "VALIDATION"
      | "NOT_FOUND"
      | "CONFLICT"
      | "MODEL_FAILED"
      | "INTERNAL",
    readonly retryable = false,
  ) {
    super(code);
    this.name = "OcrVendorBillError";
  }
}

type Extraction = {
  supplier: { name: string; confidence: number };
  invoiceNumber: { value: string; confidence: number };
  invoiceDate: { value: string; confidence: number };
  dueDate: { value: string | null; confidence: number };
  currency: { value: "KWD" | "SAR" | "AED" | "USD"; confidence: number };
  subtotal: { value: number; confidence: number };
  taxTotal: { value: number; confidence: number };
  total: { value: number; confidence: number };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    confidence: number;
  }>;
};

function confidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function amount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(3)) : 0;
}

function validDate(value: unknown): string {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function validateExtraction(value: unknown): Extraction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const currencies = new Set(["KWD", "SAR", "AED", "USD"]);
  const currencyRow = (row.currency ?? {}) as Record<string, unknown>;
  const currency = text(currencyRow.value, 3);
  const lines = Array.isArray(row.lines) ? row.lines.slice(0, 100) : [];
  const supplier = (row.supplier ?? {}) as Record<string, unknown>;
  const invoiceNumber = (row.invoiceNumber ?? {}) as Record<string, unknown>;
  const invoiceDate = (row.invoiceDate ?? {}) as Record<string, unknown>;
  const dueDate = (row.dueDate ?? {}) as Record<string, unknown>;
  const subtotal = (row.subtotal ?? {}) as Record<string, unknown>;
  const taxTotal = (row.taxTotal ?? {}) as Record<string, unknown>;
  const total = (row.total ?? {}) as Record<string, unknown>;

  const result: Extraction = {
    supplier: {
      name: text(supplier.name, 240),
      confidence: confidence(supplier.confidence),
    },
    invoiceNumber: {
      value: text(invoiceNumber.value, 160),
      confidence: confidence(invoiceNumber.confidence),
    },
    invoiceDate: {
      value: validDate(invoiceDate.value),
      confidence: confidence(invoiceDate.confidence),
    },
    dueDate: {
      value: validDate(dueDate.value) || null,
      confidence: confidence(dueDate.confidence),
    },
    currency: {
      value: (currencies.has(currency)
        ? currency
        : "KWD") as Extraction["currency"]["value"],
      confidence: confidence(currencyRow.confidence),
    },
    subtotal: {
      value: amount(subtotal.value),
      confidence: confidence(subtotal.confidence),
    },
    taxTotal: {
      value: amount(taxTotal.value),
      confidence: confidence(taxTotal.confidence),
    },
    total: {
      value: amount(total.value),
      confidence: confidence(total.confidence),
    },
    lines: lines
      .map((line) => {
        const entry = (line ?? {}) as Record<string, unknown>;
        return {
          description: text(entry.description, 500),
          quantity: amount(entry.quantity),
          unitPrice: amount(entry.unitPrice),
          total: amount(entry.total),
          confidence: confidence(entry.confidence),
        };
      })
      .filter((line) => line.description && line.quantity > 0),
  };
  if (
    !result.supplier.name ||
    !result.invoiceNumber.value ||
    !result.invoiceDate.value ||
    result.total.value <= 0 ||
    result.lines.length === 0
  ) {
    return null;
  }
  return result;
}

function overallConfidence(extraction: Extraction): number {
  const values = [
    extraction.supplier.confidence,
    extraction.invoiceNumber.confidence,
    extraction.invoiceDate.confidence,
    extraction.currency.confidence,
    extraction.total.confidence,
    ...extraction.lines.map((line) => line.confidence),
  ];
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3),
  );
}

async function setFailed(
  client: JobsClient,
  jobId: number,
  code: string,
  companyId?: string,
) {
  let query = client.database
    .from("document_processing_jobs")
    .update({ status: "failed", error: code.slice(0, 80) })
    .eq("id", jobId);
  if (companyId) query = query.eq("company_id", companyId);
  await query;
}

/**
 * Port of functions/ocr-vendor-bill — OpenRouter vision extraction.
 * Prefer admin client + explicit company_id when available.
 */
export async function runOcrVendorBill(
  client: JobsClient,
  input: { jobId: number; companyId?: string },
): Promise<OcrRunResult> {
  const startedAt = Date.now();
  const jobId = input.jobId;
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new OcrVendorBillError("VALIDATION");
  }

  let claimQuery = client.database
    .from("document_processing_jobs")
    .update({ status: "processing", error: null })
    .eq("id", jobId)
    .eq("kind", "ocr_vendor_bill")
    .in("status", ["queued", "failed"]);
  if (input.companyId) {
    claimQuery = claimQuery.eq("company_id", input.companyId);
  }
  const { data: claimed, error: claimError } = await claimQuery
    .select("id, company_id, source_key, file_name")
    .maybeSingle();
  if (claimError) throw new OcrVendorBillError("INTERNAL");
  if (!claimed) {
    let existingQuery = client.database
      .from("document_processing_jobs")
      .select("id, status, company_id")
      .eq("id", jobId)
      .eq("kind", "ocr_vendor_bill");
    if (input.companyId) {
      existingQuery = existingQuery.eq("company_id", input.companyId);
    }
    const { data: existing } = await existingQuery.maybeSingle();
    if (!existing) throw new OcrVendorBillError("NOT_FOUND");
    if (
      existing.status === "completed" ||
      existing.status === "review_needed"
    ) {
      return { jobId, status: String(existing.status) };
    }
    throw new OcrVendorBillError(
      "CONFLICT",
      existing.status === "processing",
    );
  }

  const companyId = String(claimed.company_id);
  if (input.companyId && input.companyId !== companyId) {
    throw new OcrVendorBillError("VALIDATION");
  }

  try {
    if (!claimed.source_key) throw new Error("SOURCE_MISSING");
    const { data: signed, error: signedError } = await client.storage
      .from("imports")
      .createSignedUrl(String(claimed.source_key), 300);
    if (signedError || !signed?.signedUrl) throw new Error("SOURCE_UNAVAILABLE");

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("MODEL_CONFIG");

    const openai = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const isPdf = String(claimed.file_name).toLowerCase().endsWith(".pdf");
    const media = isPdf
      ? {
          type: "file" as const,
          file: {
            filename: String(claimed.file_name),
            file_data: signed.signedUrl,
          },
        }
      : {
          type: "image_url" as const,
          image_url: { url: signed.signedUrl },
        };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENROUTER_OCR_MODEL ?? "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Extract one vendor bill. Return JSON only. Do not infer missing values. Dates must be YYYY-MM-DD, currencies KWD/SAR/AED/USD, and every field and line needs confidence from 0 to 1.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Return supplier{name,confidence}, invoiceNumber{value,confidence}, invoiceDate, dueDate, currency, subtotal, taxTotal, total, and lines[{description,quantity,unitPrice,total,confidence}].",
            },
            media,
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2200,
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content;
    const extracted = validateExtraction(content ? JSON.parse(content) : null);
    if (!extracted) throw new Error("MODEL_OUTPUT_INVALID");
    const score = overallConfidence(extracted);
    const status = score >= 0.8 ? "completed" : "review_needed";
    const { error: updateError } = await client.database
      .from("document_processing_jobs")
      .update({
        status,
        extraction: {
          ...extracted,
          model: completion.model,
          promptVersion: "ocr-v1",
        },
        confidence: score,
        error: null,
      })
      .eq("id", jobId)
      .eq("company_id", companyId)
      .eq("status", "processing");
    if (updateError) throw new Error("PERSIST_FAILED");

    console.info({
      function: "ocr-handler",
      operation: "extract",
      companyId,
      documentId: jobId,
      durationMs: Date.now() - startedAt,
      model: completion.model,
      tokenUsage: completion.usage?.total_tokens,
      resultCode: status,
    });

    return { jobId, status, confidence: score };
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "MODEL_FAILED";
    await setFailed(client, jobId, code, companyId);
    throw new OcrVendorBillError(
      code.startsWith("MODEL") ? "MODEL_FAILED" : "INTERNAL",
      true,
    );
  }
}

/** Worker registry entry for job type `ocr`. */
export async function handleOcrJob(job: JobRow): Promise<void> {
  const raw = (job.payload ?? {}) as Record<string, unknown>;
  const jobId = Number(raw.jobId);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new Error("ocr: invalid jobId");
  }
  const admin = createInsForgeAdminClient();
  await runOcrVendorBill(admin, {
    jobId,
    companyId: job.company_id,
  });
}
