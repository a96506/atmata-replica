"use server";

import { z } from "zod";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { actionFailure, createRequestId } from "./errors";
import type { ActionResult } from "./result";
import type {
  AiAssistantInput,
  AiChatResult,
  CfoNarrativeResult,
  ReconciliationSuggestion,
} from "@/types/functions";
import type { AiSuggestion, AiSuggestionScope, DocType } from "@/types";

const localeSchema = z.enum(["en", "ar"]);
const docTypeSchema = z.custom<DocType>(
  (value) =>
    typeof value === "string" &&
    [
      "pr", "rfq", "po", "grn", "vendor_bill", "vendor_payment",
      "debit_note", "vendor_return", "opportunity", "quote", "so", "dn",
      "customer_invoice", "customer_receipt", "credit_note", "customer_return",
      "journal_entry", "stock_move", "stock_adjustment", "internal_transfer",
    ].includes(value),
);
const scopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("doc"),
    docType: docTypeSchema,
    docId: z.string().trim().min(1).max(160),
  }),
  z.object({
    kind: z.literal("list"),
    docType: docTypeSchema,
  }),
]);

async function invoke<T>(
  slug: string,
  body: unknown,
  validate: (value: unknown) => value is T,
): Promise<ActionResult<T>> {
  const requestId = createRequestId();
  try {
    const client = await createInsForgeServerClient();
    const { data, error } = await client.functions.invoke(slug, { body });
    if (error) {
      return actionFailure("MODEL_FAILED", {
        messageKey: "ai.errors.modelFailed",
        retryable: true,
        requestId,
      });
    }
    if (!validate(data)) return actionFailure("INTERNAL", { requestId });
    return { ok: true, data };
  } catch {
    return actionFailure("INTERNAL", { requestId });
  }
}

function isSuggestions(value: unknown): value is AiSuggestion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.rationale === "string" &&
        typeof item.confidence === "number",
    )
  );
}

export async function requestAiSuggestions(
  scope: AiSuggestionScope,
  locale: "en" | "ar",
): Promise<ActionResult<AiSuggestion[]>> {
  const parsed = z.object({ scope: scopeSchema, locale: localeSchema }).safeParse({
    scope,
    locale,
  });
  if (!parsed.success) return actionFailure("VALIDATION");
  return invoke(
    "ai-assistant",
    { operation: "suggest", ...parsed.data } satisfies AiAssistantInput,
    isSuggestions,
  );
}

export async function requestCfoNarrative(input: {
  periodId: string;
  locale: "en" | "ar";
}): Promise<ActionResult<CfoNarrativeResult>> {
  const parsed = z
    .object({
      periodId: z.string().trim().min(1).max(160),
      locale: localeSchema,
    })
    .safeParse(input);
  if (!parsed.success) return actionFailure("VALIDATION");
  return invoke(
    "ai-assistant",
    { operation: "cfo_narrative", ...parsed.data } satisfies AiAssistantInput,
    (value): value is CfoNarrativeResult =>
      Boolean(
        value &&
          typeof value === "object" &&
          typeof (value as CfoNarrativeResult).narrative === "string" &&
          typeof (value as CfoNarrativeResult).model === "string",
      ),
  );
}

export async function sendAiChat(input: {
  message: string;
  locale: "en" | "ar";
  context?: { route?: string; scope?: AiSuggestionScope };
}): Promise<ActionResult<AiChatResult>> {
  const parsed = z
    .object({
      message: z.string().trim().min(1).max(2_000),
      locale: localeSchema,
      context: z
        .object({
          route: z.string().trim().max(240).optional(),
          scope: scopeSchema.optional(),
        })
        .optional(),
    })
    .safeParse(input);
  if (!parsed.success) return actionFailure("VALIDATION");
  return invoke(
    "ai-assistant",
    { operation: "chat", ...parsed.data } satisfies AiAssistantInput,
    (value): value is AiChatResult =>
      Boolean(
        value &&
          typeof value === "object" &&
          typeof (value as AiChatResult).reply === "string" &&
          isSuggestions((value as AiChatResult).suggestions),
      ),
  );
}

export async function queueAiSuggestion(input: {
  suggestionId: string;
  action: string;
  payload: Record<string, unknown>;
}): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = z
    .object({
      suggestionId: z.string().trim().min(1).max(160),
      action: z.enum([
        "create_draft_vendor_bill",
        "accept_reconciliation_match",
        "create_purchase_requisition",
        "create_draft_journal_entry",
      ]),
      payload: z.record(z.string(), z.unknown()),
    })
    .safeParse(input);
  if (!parsed.success) return actionFailure("VALIDATION");
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc("queue_ai_action", {
    p_suggestion_id: parsed.data.suggestionId,
    p_action: parsed.data.action,
    p_payload: parsed.data.payload,
  });
  if (error || !data) return actionFailure("CONFLICT");
  const row = data as { id?: string; status?: string };
  if (!row.id || !row.status) return actionFailure("INTERNAL");
  return { ok: true, data: { id: row.id, status: row.status } };
}

export async function dismissAiSuggestion(
  suggestionId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().trim().min(1).max(160).safeParse(suggestionId);
  if (!parsed.success) return actionFailure("VALIDATION");
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc("dismiss_ai_suggestion", {
    p_suggestion_id: parsed.data,
  });
  if (error || !data) return actionFailure("NOT_FOUND");
  return { ok: true, data: { id: parsed.data } };
}

export async function requestVendorBillOcr(
  jobId: number,
): Promise<ActionResult<{ jobId: number; status: string }>> {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return actionFailure("VALIDATION");
  return invoke(
    "ocr-vendor-bill",
    { jobId },
    (value): value is { jobId: number; status: string } =>
      Boolean(
        value &&
          typeof value === "object" &&
          typeof (value as { jobId?: unknown }).jobId === "number" &&
          typeof (value as { status?: unknown }).status === "string",
      ),
  );
}

export async function requestReconciliationSuggestions(input: {
  statementId: string;
  lineIds?: string[];
}): Promise<ActionResult<ReconciliationSuggestion[]>> {
  const parsed = z
    .object({
      statementId: z.string().trim().min(1).max(160),
      lineIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return actionFailure("VALIDATION");
  return invoke(
    "reconciliation-suggest",
    parsed.data,
    (value): value is ReconciliationSuggestion[] => Array.isArray(value),
  );
}
