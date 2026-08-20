import "server-only";

import { revalidatePath } from "next/cache";

import { KnownActionError, parseWriteRpcError } from "@/lib/actions/errors";
import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";

export type DocumentWriteResult = {
  id: string;
  number: string;
  state: string;
  rowVersion: number;
  approvalRequestId?: string;
  postedEffects?: unknown;
};

type RpcError = { message?: string; code?: string } | null;

const DOC_LIST_PATH: Record<string, string> = {
  pr: "/purchasing/purchase-requisitions",
  rfq: "/purchasing/rfqs",
  po: "/purchasing/purchase-orders",
  grn: "/purchasing/goods-receipts",
  vendor_bill: "/purchasing/bills",
  vendor_payment: "/purchasing/payments",
  vendor_return: "/purchasing/vendor-returns",
  debit_note: "/purchasing/debit-notes",
  quote: "/sales/quotes",
  so: "/sales/orders",
  dn: "/sales/deliveries",
  customer_invoice: "/sales/invoices",
  customer_receipt: "/sales/receipts",
  customer_return: "/sales/returns",
  credit_note: "/sales/credit-notes",
  journal_entry: "/accounting/journal-entries",
  stock_adjustment: "/inventory/adjustments",
  internal_transfer: "/inventory/transfers",
};

export function throwWriteRpc(error: RpcError): never {
  const parsed = parseWriteRpcError(error?.message);
  throw new KnownActionError(parsed.code, {
    currentRowVersion: parsed.currentRowVersion,
    retryable:
      parsed.code === "STALE_VERSION" ||
      parsed.code === "CONFLICT" ||
      parsed.code === "UNAVAILABLE",
  });
}

export async function callWriteRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<DocumentWriteResult> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc(name, args);
  if (error) throwWriteRpc(error);
  if (data == null) {
    throw new KnownActionError("INTERNAL");
  }
  return camelize<DocumentWriteResult>(data);
}

export function revalidateDocumentPaths(
  locale: "en" | "ar",
  docType: string,
  docId?: string,
) {
  const list = DOC_LIST_PATH[docType];
  if (!list) return;

  revalidatePath(`/${locale}${list}`);
  revalidatePath(list);
  if (docId) {
    revalidatePath(`/${locale}${list}/${docId}`);
    revalidatePath(`${list}/${docId}`);
  }
}
