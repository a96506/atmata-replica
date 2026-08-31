"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFailure, createRequestId } from "./errors";
import type { ActionResult } from "./result";
import {
  generatePdf,
  PdfServiceError,
  type DocPdfInput,
} from "@/lib/services/pdf-gen";
import type {
  FinancialPdfType,
  PdfDocType,
  PdfResult,
} from "@/types/functions";

const docInputSchema = z.object({
  docType: z.enum([
    "quote",
    "invoice",
    "delivery",
    "purchase_order",
    "vendor_bill",
  ]),
  docId: z.string().trim().min(1).max(160),
  locale: z.enum(["en", "ar"]),
  mode: z.enum(["preview", "save"]),
});

const financialInputSchema = z.object({
  type: z.enum(["pl", "balance_sheet", "cash_flow", "trial_balance"]),
  periodId: z.string().trim().min(1).max(160),
  locale: z.enum(["en", "ar"]),
  mode: z.enum(["preview", "save"]),
});

function mapPdfError(error: unknown, requestId: string): ActionResult<never> {
  if (error instanceof PdfServiceError) {
    const messageKey =
      error.code === "STORAGE_FAILED"
        ? "documents.errors.generationFailed"
        : error.code === "NOT_FOUND"
          ? "errors.notFound"
          : error.code === "UNAVAILABLE"
            ? "documents.errors.generationFailed"
            : undefined;
    return actionFailure(error.code, {
      messageKey,
      retryable: error.retryable,
      requestId,
    });
  }
  return actionFailure("INTERNAL", { requestId });
}

export async function generateDocPdf(input: {
  docType: PdfDocType;
  docId: string;
  locale: "en" | "ar";
  mode: "preview" | "save";
}): Promise<ActionResult<PdfResult>> {
  const parsed = docInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure("VALIDATION", {
      messageKey: "documents.errors.invalidRequest",
    });
  }
  const requestId = createRequestId();
  try {
    const data = await generatePdf(parsed.data as DocPdfInput);
    if (parsed.data.mode === "save") {
      revalidatePath("/");
    }
    return { ok: true, data };
  } catch (error) {
    return mapPdfError(error, requestId);
  }
}

export async function generateFinancialPdf(input: {
  type: FinancialPdfType;
  periodId: string;
  locale: "en" | "ar";
  mode: "preview" | "save";
}): Promise<ActionResult<PdfResult>> {
  const parsed = financialInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure("VALIDATION", {
      messageKey: "documents.errors.invalidRequest",
    });
  }
  const requestId = createRequestId();
  try {
    const data = await generatePdf({
      docType: "financial",
      ...parsed.data,
    });
    return { ok: true, data };
  } catch (error) {
    return mapPdfError(error, requestId);
  }
}
