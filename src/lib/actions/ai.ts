"use server";

import { z } from "zod";
import { enqueueJob } from "@/lib/jobs";
import {
  ReconSuggestError,
  runReconciliationSuggest,
} from "@/lib/jobs/handlers/recon";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getAppSession } from "@/lib/insforge/session";
import { actionFailure, createRequestId } from "./errors";
import type { ActionResult } from "./result";
import {
  AiServiceError,
  requireAiAuth,
  runChat,
  runCfoNarrative,
  runSuggest,
} from "@/lib/services/ai-assistant";
import type {
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

function mapAiError(error: unknown, requestId: string): ActionResult<never> {
  if (error instanceof AiServiceError) {
    return actionFailure(error.code, {
      messageKey:
        error.code === "MODEL_FAILED" ? "ai.errors.modelFailed" : undefined,
      retryable: error.retryable,
      requestId,
    });
  }
  return actionFailure("INTERNAL", { requestId });
}

function isSuggestions(value: unknown): value is AiSuggestion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as AiSuggestion).id === "string" &&
        typeof (item as AiSuggestion).title === "string" &&
        typeof (item as AiSuggestion).rationale === "string" &&
        typeof (item as AiSuggestion).confidence === "number",
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
  const requestId = createRequestId();
  try {
    const auth = await requireAiAuth();
    const data = await runSuggest(auth, parsed.data.scope, parsed.data.locale);
    if (!isSuggestions(data)) return actionFailure("INTERNAL", { requestId });
    return { ok: true, data };
  } catch (error) {
    return mapAiError(error, requestId);
  }
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
  const requestId = createRequestId();
  try {
    const auth = await requireAiAuth();
    const data = await runCfoNarrative(
      auth,
      parsed.data.periodId,
      parsed.data.locale,
    );
    return { ok: true, data };
  } catch (error) {
    return mapAiError(error, requestId);
  }
}

/**
 * Non-streaming chat (JSON). Prefer `/api/ai` with Accept: text/event-stream
 * from the client for streamed replies (see AiChatPanel).
 */
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
  const requestId = createRequestId();
  try {
    const auth = await requireAiAuth();
    const data = await runChat(
      auth,
      parsed.data.message,
      parsed.data.locale,
      parsed.data.context,
    );
    return { ok: true, data };
  } catch (error) {
    return mapAiError(error, requestId);
  }
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
): Promise<ActionResult<{ jobId: number; status: string; queueJobId?: string }>> {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return actionFailure("VALIDATION");
  const requestId = createRequestId();
  try {
    const { session } = await getAppSession();
    if (!session) return actionFailure("UNAUTHENTICATED", { requestId });

    const { id: queueJobId } = await enqueueJob(
      "ocr",
      {
        jobId,
        companyId: session.companyId,
        actorUserId: session.user.id,
      },
      { companyId: session.companyId },
    );
    return {
      ok: true,
      data: { jobId, status: "queued", queueJobId },
    };
  } catch {
    return actionFailure("INTERNAL", { requestId });
  }
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
  const requestId = createRequestId();
  try {
    const { session } = await getAppSession();
    if (!session) return actionFailure("UNAUTHENTICATED", { requestId });

    const client = await createInsForgeServerClient();
    // Day-one: run sync so UI gets suggestions; worker handler remains for enqueue path.
    const data = await runReconciliationSuggest(
      client,
      parsed.data,
      {
        companyId: session.companyId,
        actorUserId: session.user.id,
        persistMode: "rpc",
      },
    );
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ReconSuggestError) {
      return actionFailure(
        error.code === "MODEL_FAILED" ? "MODEL_FAILED" : error.code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL",
        {
          messageKey: "ai.errors.modelFailed",
          retryable: error.retryable,
          requestId,
        },
      );
    }
    return actionFailure("INTERNAL", { requestId });
  }
}
