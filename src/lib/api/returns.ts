import type { CreditNote, CustomerReturn, DebitNote, VendorReturn } from "@/types";
import {
  getTable,
  listPage,
  listTable,
  type ListPageResult,
} from "@/lib/db/read";
import { RETURN_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

// Vendor return lists: hard-capped via listTable/ALL_PAGES_HARD_CAP.

export async function listVendorReturns(): Promise<VendorReturn[]> {
  return listTable("vendor_returns", RETURN_SELECTS.vendorReturns, docOrder);
}

/** One server page of vendor returns (same projection/order as {@link listVendorReturns}). */
export async function listVendorReturnsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<VendorReturn>> {
  return listPage("vendor_returns", RETURN_SELECTS.vendorReturns, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}
export async function getVendorReturn(id: string): Promise<VendorReturn | null> {
  return getTable("vendor_returns", RETURN_SELECTS.vendorReturns, id);
}

export async function listDebitNotes(): Promise<DebitNote[]> {
  return listTable("debit_notes", RETURN_SELECTS.debitNotes, docOrder);
}

/** One server page of debit notes (same projection/order as {@link listDebitNotes}). */
export async function listDebitNotesPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<DebitNote>> {
  return listPage("debit_notes", RETURN_SELECTS.debitNotes, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}
export async function getDebitNote(id: string): Promise<DebitNote | null> {
  return getTable("debit_notes", RETURN_SELECTS.debitNotes, id);
}

export async function listCustomerReturns(): Promise<CustomerReturn[]> {
  return listTable("customer_returns", RETURN_SELECTS.customerReturns, docOrder);
}

/** One server page of customer returns (same projection/order as {@link listCustomerReturns}). */
export async function listCustomerReturnsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<CustomerReturn>> {
  return listPage(
    "customer_returns",
    RETURN_SELECTS.customerReturns,
    docOrder,
    [],
    { limit: params.limit, offset: params.offset },
  );
}

export async function getCustomerReturn(id: string): Promise<CustomerReturn | null> {
  return getTable("customer_returns", RETURN_SELECTS.customerReturns, id);
}

export async function listCreditNotes(): Promise<CreditNote[]> {
  return listTable("credit_notes", RETURN_SELECTS.creditNotes, docOrder);
}

/** One server page of credit notes (same projection/order as {@link listCreditNotes}). */
export async function listCreditNotesPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<CreditNote>> {
  return listPage("credit_notes", RETURN_SELECTS.creditNotes, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getCreditNote(id: string): Promise<CreditNote | null> {
  return getTable("credit_notes", RETURN_SELECTS.creditNotes, id);
}
