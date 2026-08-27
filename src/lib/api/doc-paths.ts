/**
 * Pure (server + client safe) mapping from a document type to its app route.
 * Kept separate from `lib/api/inbox.ts` so client components (e.g.
 * `DocActionBar`) can import the path helper without pulling server-only
 * database code into the client bundle.
 */
import type { DocType } from "@/types";

export const DOC_PATH_BY_TYPE: Record<string, (id: string) => string> = {
  pr: (id) => `/purchasing/purchase-requisitions/${id}`,
  rfq: (id) => `/purchasing/rfqs/${id}`,
  po: (id) => `/purchasing/purchase-orders/${id}`,
  grn: (id) => `/purchasing/goods-receipts/${id}`,
  vendor_bill: (id) => `/purchasing/bills/${id}`,
  vendor_payment: (id) => `/purchasing/payments/${id}`,
  vendor_return: (id) => `/purchasing/vendor-returns/${id}`,
  debit_note: (id) => `/purchasing/debit-notes/${id}`,
  quote: (id) => `/sales/quotes/${id}`,
  so: (id) => `/sales/orders/${id}`,
  dn: (id) => `/sales/deliveries/${id}`,
  customer_invoice: (id) => `/sales/invoices/${id}`,
  customer_receipt: (id) => `/sales/receipts/${id}`,
  customer_return: (id) => `/sales/returns/${id}`,
  credit_note: (id) => `/sales/credit-notes/${id}`,
  journal_entry: (id) => `/accounting/journal-entries/${id}`,
  stock_adjustment: (id) => `/inventory/adjustments/${id}`,
  internal_transfer: (id) => `/inventory/transfers/${id}`,
};

export function docPath(
  docType: string | null | undefined,
  docId: string | null | undefined,
): string | null {
  if (!docType || !docId) return null;
  const build = DOC_PATH_BY_TYPE[docType];
  return build ? build(docId) : null;
}
