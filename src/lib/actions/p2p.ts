"use server";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  createPurchaseRequisitionSchema,
  createRfqSchema,
  createVendorBillSchema,
  createVendorPaymentSchema,
  createVendorReturnSchema,
} from "@/lib/actions/validation/p2p";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";

export async function createPurchaseRequisitionAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createPurchaseRequisitionSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_purchase_requisition", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "pr", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createRfqAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createRfqSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_rfq", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "rfq", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createPurchaseOrderAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createPurchaseOrderSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_purchase_order", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "po", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createGoodsReceiptAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createGoodsReceiptSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_goods_receipt", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "grn", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createVendorBillAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createVendorBillSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_vendor_bill", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "vendor_bill", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createVendorPaymentAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createVendorPaymentSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    // SQL reads allocations from header/source; also pass as lines for hash parity.
    const data = await callWriteRpc("create_vendor_payment", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: {
        ...parsed.data.header,
        allocations: parsed.data.lines,
      },
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "vendor_payment", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createVendorReturnAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createVendorReturnSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_vendor_return", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "vendor_return", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
