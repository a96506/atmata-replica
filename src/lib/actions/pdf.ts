"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { actionFailure, createRequestId } from "./errors";
import type { ActionResult } from "./result";
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

function isPdfResult(value: unknown): value is PdfResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (result.mode === "preview") {
    return (
      result.contentType === "application/pdf" &&
      typeof result.base64 === "string" &&
      result.base64.length > 100
    );
  }
  return (
    result.mode === "save" &&
    typeof result.attachmentId === "string" &&
    typeof result.url === "string" &&
    typeof result.key === "string" &&
    typeof result.cached === "boolean"
  );
}

async function invokePdf(body: unknown): Promise<ActionResult<PdfResult>> {
  const requestId = createRequestId();
  try {
    const client = await createInsForgeServerClient();
    const { data, error } = await client.functions.invoke("pdf-gen", { body });
    if (error) {
      return actionFailure("UNAVAILABLE", {
        messageKey: "documents.errors.generationFailed",
        retryable: true,
        requestId,
      });
    }
    if (!isPdfResult(data)) {
      return actionFailure("INTERNAL", { requestId });
    }
    return { ok: true, data };
  } catch {
    return actionFailure("INTERNAL", { requestId });
  }
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
  const result = await invokePdf(parsed.data);
  if (result.ok && parsed.data.mode === "save") {
    revalidatePath("/");
  }
  return result;
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
  return invokePdf({ docType: "financial", ...parsed.data });
}
