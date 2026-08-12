import {
  CREDIT_NOTES,
  CUSTOMER_RETURNS,
  DEBIT_NOTES,
  VENDOR_RETURNS,
} from "@/mocks/seed/returns";
import type { CreditNote, CustomerReturn, DebitNote, VendorReturn } from "@/types";

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listVendorReturns(): Promise<VendorReturn[]> {
  return VENDOR_RETURNS;
}
export async function getVendorReturn(id: string): Promise<VendorReturn | null> {
  return byId(VENDOR_RETURNS, id);
}

export async function listDebitNotes(): Promise<DebitNote[]> {
  return DEBIT_NOTES;
}
export async function getDebitNote(id: string): Promise<DebitNote | null> {
  return byId(DEBIT_NOTES, id);
}

export async function listCustomerReturns(): Promise<CustomerReturn[]> {
  return CUSTOMER_RETURNS;
}
export async function getCustomerReturn(id: string): Promise<CustomerReturn | null> {
  return byId(CUSTOMER_RETURNS, id);
}

export async function listCreditNotes(): Promise<CreditNote[]> {
  return CREDIT_NOTES;
}
export async function getCreditNote(id: string): Promise<CreditNote | null> {
  return byId(CREDIT_NOTES, id);
}
