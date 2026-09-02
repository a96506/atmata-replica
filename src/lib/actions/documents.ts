"use server";

import { recordChangedFields } from "@/lib/actions/audit";
import {
  createRequestId,
  normalizeActionError,
} from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  postDocumentSchema,
  reverseDocumentSchema,
  transitionDocumentSchema,
} from "@/lib/actions/validation/common";
import {
  awardRfqSchema,
  updateDocumentHeaderSchema,
} from "@/lib/actions/validation/p2p";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";

export type { DocumentWriteResult } from "@/lib/actions/write-rpc";


/** Maps DocType → table for header before-reads (mirrors inbox DOCUMENT_TABLE_BY_TYPE). */
const DOCUMENT_TABLE_BY_TYPE: Record<string, string> = {
  pr: "purchase_requisitions",
  rfq: "rfqs",
  po: "purchase_orders",
  grn: "goods_receipts",
  vendor_bill: "vendor_bills",
  vendor_payment: "vendor_payments",
  vendor_return: "vendor_returns",
  debit_note: "debit_notes",
  quote: "quotes",
  so: "sales_orders",
  dn: "delivery_notes",
  customer_invoice: "customer_invoices",
  customer_receipt: "customer_receipts",
  customer_return: "customer_returns",
  credit_note: "credit_notes",
  journal_entry: "journal_entries",
  stock_adjustment: "stock_adjustments",
  internal_transfer: "internal_transfers",
};

async function fetchDocumentHeaderFields(
  docType: string,
  docId: string,
): Promise<Record<string, unknown>> {
  const table = DOCUMENT_TABLE_BY_TYPE[docType];
  if (!table) return {};
  const { createInsForgeServerClient } = await import("@/lib/insforge/server");
  const { camelize } = await import("@/lib/db/case");
  const client = await createInsForgeServerClient();
  const { data } = await client.database
    .from(table)
    .select("date,notes")
    .eq("id", docId)
    .maybeSingle();
  if (!data) return {};
  return camelize<Record<string, unknown>>(data);
}

export async function updateDocumentHeaderAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      updateDocumentHeaderSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const patch: Record<string, unknown> = {};
    if (parsed.data.patch.date !== undefined) {
      patch.date = parsed.data.patch.date;
    }
    if (parsed.data.patch.notes !== undefined) {
      patch.notes = parsed.data.patch.notes;
    }

    const before = await fetchDocumentHeaderFields(
      parsed.data.docType,
      parsed.data.docId,
    );

    const data = await callWriteRpc("update_document_header", {
      p_doc_type: parsed.data.docType,
      p_doc_id: parsed.data.docId,
      p_expected_row_version: parsed.data.expectedRowVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_patch: {
        date: parsed.data.patch.date,
        notes: parsed.data.patch.notes,
      },
    });

    await recordChangedFields({
      docType: parsed.data.docType,
      docId: parsed.data.docId,
      before,
      patch,
      reason: "document header updated",
    });

    revalidateDocumentPaths(
      parsed.data.locale,
      parsed.data.docType,
      parsed.data.docId,
    );
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

const APPROVAL_DOC_TYPES = new Set([
  "po",
  "vendor_bill",
  "vendor_payment",
  "debit_note",
  "quote",
  "so",
  "customer_invoice",
  "customer_receipt",
  "credit_note",
  "journal_entry",
]);

async function findPendingApprovalRequestId(
  docType: string,
  docId: string,
): Promise<string | null> {
  const { createInsForgeServerClient } = await import(
    "@/lib/insforge/server"
  );
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from("approval_requests")
    .select("id")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export async function transitionDocumentAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      transitionDocumentSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const { action, docType, docId, expectedRowVersion, idempotencyKey, reason } =
      parsed.data;

    let data: DocumentWriteResult;

    if (action === "submit" && APPROVAL_DOC_TYPES.has(docType)) {
      data = await callWriteRpc("create_approval_request", {
        p_doc_type: docType,
        p_doc_id: docId,
        p_expected_row_version: expectedRowVersion,
        p_idempotency_key: idempotencyKey,
      });
    } else if (action === "approve" || action === "reject") {
      const approvalRequestId = await findPendingApprovalRequestId(
        docType,
        docId,
      );
      if (!approvalRequestId) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            messageKey: "errors.notFound",
            requestId,
            retryable: false,
          },
        };
      }
      data = await callWriteRpc("resolve_approval_request", {
        p_approval_request_id: approvalRequestId,
        p_decision: action === "approve" ? "approved" : "rejected",
        p_expected_row_version: expectedRowVersion,
        p_idempotency_key: idempotencyKey,
        p_reason: reason ?? null,
      });
    } else {
      data = await callWriteRpc("transition_document", {
        p_doc_type: docType,
        p_doc_id: docId,
        p_action: action,
        p_expected_row_version: expectedRowVersion,
        p_idempotency_key: idempotencyKey,
        p_reason: reason ?? null,
      });
    }

    revalidateDocumentPaths(parsed.data.locale, docType, docId);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function postDocumentAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(postDocumentSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("post_document", {
      p_doc_type: parsed.data.docType,
      p_doc_id: parsed.data.docId,
      p_expected_row_version: parsed.data.expectedRowVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
    });

    revalidateDocumentPaths(
      parsed.data.locale,
      parsed.data.docType,
      parsed.data.docId,
    );
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function reverseDocumentAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(reverseDocumentSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("reverse_document", {
      p_doc_type: parsed.data.docType,
      p_doc_id: parsed.data.docId,
      p_expected_row_version: parsed.data.expectedRowVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_reason: parsed.data.reason ?? null,
    });

    revalidateDocumentPaths(
      parsed.data.locale,
      parsed.data.docType,
      parsed.data.docId,
    );
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function awardRfqAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(awardRfqSchema, input, requestId);
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("award_rfq", {
      p_rfq_id: parsed.data.rfqId,
      p_quote_id: parsed.data.quoteId,
      p_expected_row_version: parsed.data.expectedRowVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
    });

    revalidateDocumentPaths(parsed.data.locale, "rfq", parsed.data.rfqId);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
