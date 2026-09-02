"use server";

import { revalidatePath } from "next/cache";

import { createRequestId, KnownActionError, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  createCustomerInvoiceSchema,
  createCustomerReceiptSchema,
  applyCreditToInvoiceSchema,
  createCustomerReturnSchema,
  createDeliveryNoteSchema,
  createOpportunitySchema,
  deleteOpportunitySchema,
  updateOpportunitySchema,
  createQuoteSchema,
  createSalesOrderSchema,
} from "@/lib/actions/validation/q2c";
import { camelize, snakelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";
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


export async function applyCreditToInvoiceAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(applyCreditToInvoiceSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("apply_credit_to_invoice", {
      p_invoice_id: parsed.data.invoiceId,
      p_credit_note_id: parsed.data.creditNoteId,
      p_amount: parsed.data.amount,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_post_gl: parsed.data.postGl ?? false,
    });

    revalidateDocumentPaths(parsed.data.locale, "customer_invoice", parsed.data.invoiceId);
    revalidateDocumentPaths(parsed.data.locale, "credit_note", parsed.data.creditNoteId);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

function revalidateSales(locale: "en" | "ar") {
  revalidatePath(`/${locale}/sales`);
  revalidatePath("/sales");
}

/** SDK insert on opportunities (number assigned by DB trigger). */
export async function createOpportunityAction(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createOpportunitySchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, title, customerId, stage, value } = parsed.data;

    const client = await createInsForgeServerClient();
    const { data, error } = await client.database
      .from("opportunities")
      .insert([
        snakelize({
          title,
          customerId,
          stage,
          value,
        }),
      ])
      .select("id,number")
      .maybeSingle();

    if (error) {
      const msg = error.message ?? "";
      if (/unique/i.test(msg) || /duplicate key/i.test(msg)) {
        throw new KnownActionError("DUPLICATE", { messageKey: "errors.duplicate" });
      }
      if (/foreign key/i.test(msg)) {
        throw new KnownActionError("VALIDATION", { messageKey: "errors.validation" });
      }
      throw new KnownActionError("INTERNAL", { messageKey: "errors.internal" });
    }
    if (data == null) throw new KnownActionError("INTERNAL");

    revalidateSales(locale);
    const row = camelize<{ id: string; number: string }>(data);
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

/** SDK update on opportunities (RLS: ar_clerk/admin). */
export async function updateOpportunityAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateOpportunitySchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, stage, value } = parsed.data;

    const patch: Record<string, unknown> = {};
    if (stage !== undefined) patch.stage = stage;
    if (value !== undefined) patch.value = value;

    const client = await createInsForgeServerClient();
    const { data, error } = await client.database
      .from("opportunities")
      .update(snakelize(patch))
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      const msg = error.message ?? "";
      if (/foreign key/i.test(msg)) {
        throw new KnownActionError("VALIDATION", { messageKey: "errors.validation" });
      }
      throw new KnownActionError("INTERNAL", { messageKey: "errors.internal" });
    }
    if (data == null) throw new KnownActionError("NOT_FOUND");

    revalidateSales(locale);
    const row = camelize<{ id: string }>(data);
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

/** SDK delete on opportunities (RLS: ar_clerk/admin). */
export async function deleteOpportunityAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteOpportunitySchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id } = parsed.data;

    const client = await createInsForgeServerClient();
    const { error } = await client.database
      .from("opportunities")
      .delete()
      .eq("id", id);

    if (error) {
      throw new KnownActionError("INTERNAL", { messageKey: "errors.internal" });
    }

    revalidateSales(locale);
    return { ok: true, data: { id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

