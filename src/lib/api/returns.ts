import type { CreditNote, CustomerReturn, DebitNote, VendorReturn } from "@/types";
import { getTable, listTable } from "@/lib/db/read";
import { RETURN_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

export async function listVendorReturns(): Promise<VendorReturn[]> {
  return listTable("vendor_returns", RETURN_SELECTS.vendorReturns, docOrder);
}
export async function getVendorReturn(id: string): Promise<VendorReturn | null> {
  return getTable("vendor_returns", RETURN_SELECTS.vendorReturns, id);
}

export async function listDebitNotes(): Promise<DebitNote[]> {
  return listTable("debit_notes", RETURN_SELECTS.debitNotes, docOrder);
}
export async function getDebitNote(id: string): Promise<DebitNote | null> {
  return getTable("debit_notes", RETURN_SELECTS.debitNotes, id);
}

export async function listCustomerReturns(): Promise<CustomerReturn[]> {
  return listTable("customer_returns", RETURN_SELECTS.customerReturns, docOrder);
}
export async function getCustomerReturn(id: string): Promise<CustomerReturn | null> {
  return getTable("customer_returns", RETURN_SELECTS.customerReturns, id);
}

export async function listCreditNotes(): Promise<CreditNote[]> {
  return listTable("credit_notes", RETURN_SELECTS.creditNotes, docOrder);
}
export async function getCreditNote(id: string): Promise<CreditNote | null> {
  return getTable("credit_notes", RETURN_SELECTS.creditNotes, id);
}
