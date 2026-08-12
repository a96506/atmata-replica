import type { Currency, DocState, ISO8601 } from "../common";
import type { DocLine } from "./p2p";

export type Opportunity = {
  id: string;
  number: string;
  customerId: string;
  title: string;
  stage: "qualified" | "proposal" | "negotiation" | "won" | "lost";
  value: number;
  probability: number;
  nextAction?: string;
  daysIdle: number;
};

export type Quote = {
  id: string;
  number: string;
  companyId: string;
  customerId: string;
  opportunityId?: string;
  date: ISO8601;
  validUntil: ISO8601;
  currency: Currency;
  state: DocState | "accepted" | "expired";
  lines: DocLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  notes?: string;
};

export type SalesOrder = {
  id: string;
  number: string;
  companyId: string;
  customerId: string;
  quoteId?: string;
  date: ISO8601;
  expectedDeliveryDate: ISO8601;
  currency: Currency;
  warehouseId: string;
  state: DocState;
  blockedReason?: string;
  exceptional: boolean;
  lines: DocLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
};

export type DeliveryLine = DocLine & {
  soLineId: string;
  qtyDelivered: number;
};

export type DeliveryNote = {
  id: string;
  number: string;
  companyId: string;
  soId: string;
  customerId: string;
  warehouseId: string;
  date: ISO8601;
  state: DocState;
  lines: DeliveryLine[];
};

export type CustomerInvoiceLine = DocLine & {
  soLineId?: string;
  dnLineId?: string;
};

export type CustomerInvoice = {
  id: string;
  number: string;
  companyId: string;
  customerId: string;
  soId?: string;
  dnId?: string;
  date: ISO8601;
  dueDate: ISO8601;
  currency: Currency;
  state: DocState;
  lines: CustomerInvoiceLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  paid: number;
};

export type CustomerReceiptAllocation = {
  invoiceId: string;
  amount: number;
};

/* ------------------------------------------------------------------ *
 *  Customer Return + Credit Note
 * ------------------------------------------------------------------ */

export type CustomerReturnLine = {
  id: string;
  dnLineId: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCodeId: string | null;
  reasonCode:
    | "damaged"
    | "wrong_item"
    | "not_as_described"
    | "customer_dissatisfied"
    | "expired"
    | "other";
  notes?: string;
  lotNumber?: string;
};

export type CustomerReturn = {
  id: string;
  number: string;
  companyId: string;
  /** DN this return reverses. */
  dnId: string;
  customerId: string;
  warehouseId: string;
  date: ISO8601;
  state: DocState;
  lines: CustomerReturnLine[];
  /** Credit Note generated on post. */
  creditNoteId?: string;
  notes?: string;
};

export type CreditNote = {
  id: string;
  number: string;
  companyId: string;
  customerId: string;
  /** The Customer Return that gave rise to this Credit Note. */
  customerReturnId: string;
  /** The Customer Invoice being credited against (if any). */
  invoiceId?: string;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Amount applied (against an invoice or refunded to the customer). */
  applied: number;
};

export type CustomerReceipt = {
  id: string;
  number: string;
  companyId: string;
  customerId: string;
  bankAccountId: string;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  amount: number;
  allocations: CustomerReceiptAllocation[];
  method: "wire" | "cheque" | "cash" | "card";
};
