"use server";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  createCustomerInvoiceSchema,
  createCustomerReceiptSchema,
  createCustomerReturnSchema,
  createDeliveryNoteSchema,
  createQuoteSchema,
  createSalesOrderSchema,
} from "@/lib/actions/validation/q2c";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";

export async function createQuoteAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createQuoteSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_quote", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "quote", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createSalesOrderAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createSalesOrderSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_sales_order", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "so", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createDeliveryNoteAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createDeliveryNoteSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_delivery_note", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "dn", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createCustomerInvoiceAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createCustomerInvoiceSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_customer_invoice", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "customer_invoice", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createCustomerReceiptAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createCustomerReceiptSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    // SQL reads allocations from header/source; also pass as lines for hash parity.
    const data = await callWriteRpc("create_customer_receipt", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: {
        ...parsed.data.header,
        allocations: parsed.data.lines,
      },
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "customer_receipt", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function createCustomerReturnAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createCustomerReturnSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_customer_return", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "customer_return", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
