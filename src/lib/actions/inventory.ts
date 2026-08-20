"use server";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  createInternalTransferSchema,
  createStockAdjustmentSchema,
} from "@/lib/actions/validation/inventory";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";

export async function createInternalTransferAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createInternalTransferSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_internal_transfer", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "internal_transfer", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createStockAdjustmentAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createStockAdjustmentSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_stock_adjustment", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "stock_adjustment", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
