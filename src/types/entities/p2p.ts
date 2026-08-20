import type { Currency, DocState, ISO8601 } from "../common";

export type DocLine = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCodeId: string | null;
  discount?: number;
  /** Mirror of how much has flowed downstream (PO line received, SO line delivered). */
  qtyReceived?: number;
  qtyDelivered?: number;
  qtyInvoiced?: number;
};

export type PurchaseRequisition = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  requestedBy: string;
  date: ISO8601;
  neededBy: ISO8601;
  state: DocState;
  lines: DocLine[];
  notes?: string | null;
};

export type PurchaseOrder = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  supplierId: string;
  prId?: string | null;
  date: ISO8601;
  expectedDate: ISO8601;
  currency: Currency;
  paymentTermId: string;
  warehouseId: string;
  state: DocState;
  lines: DocLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  notes?: string | null;
};

export type GrnLine = DocLine & {
  poLineId: string;
  qtyReceived: number;
  lotNumber?: string | null;
};

export type GoodsReceipt = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  poId: string;
  supplierId: string;
  warehouseId: string;
  date: ISO8601;
  state: DocState;
  lines: GrnLine[];
  notes?: string | null;
};

export type VendorBillLine = DocLine & {
  poLineId?: string | null;
  grnLineId?: string | null;
};

export type ThreeWayMatchResult = "matched" | "discrepancy" | "review";

export type VendorBill = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  supplierId: string;
  poId?: string | null;
  grnId?: string | null;
  invoiceNumber: string;
  date: ISO8601;
  dueDate: ISO8601;
  currency: Currency;
  state: DocState;
  lines: VendorBillLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  paid: number;
  threeWayMatch: ThreeWayMatchResult;
  discrepancyReason?: string | null;
  sourceOcrJobId?: number | null;
};

export type VendorPaymentAllocation = {
  billId: string;
  amount: number;
};

/* ------------------------------------------------------------------ *
 *  Request for Quotation (RFQ)
 * ------------------------------------------------------------------ */

export type RFQLine = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  /** Source PR line(s) this RFQ line was adopted from. */
  prLineIds?: string[];
};

/** One vendor's response to an RFQ. */
export type RFQQuote = {
  id: string;
  vendorId: string;
  receivedDate: ISO8601;
  /** Per-line price quoted by this vendor. */
  lineQuotes: Array<{
    rfqLineId: string;
    unitPrice: number;
    leadTimeDays: number;
    notes?: string | null;
  }>;
  currency: Currency;
  /** Roll-up of all line quotes × qty, for ranking. */
  total: number;
  validUntil?: ISO8601 | null;
};

export type RFQAward = {
  /** The vendor (and therefore RFQQuote) selected when this RFQ was awarded. */
  vendorId: string;
  quoteId: string;
  awardedAt: ISO8601;
  awardedBy: string;
  /** PO id created from the award. */
  poId?: string | null;
};

export type RFQ = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  /** PR(s) this RFQ was adopted from. */
  prIds: string[];
  date: ISO8601;
  expectedQuoteBy: ISO8601;
  state: DocState;
  invitedVendorIds: string[];
  lines: RFQLine[];
  quotes: RFQQuote[];
  award?: RFQAward;
  notes?: string | null;
};

/* ------------------------------------------------------------------ *
 *  Vendor Return + Debit Note
 * ------------------------------------------------------------------ */

export type VendorReturnLine = {
  id: string;
  grnLineId: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCodeId: string | null;
  reasonCode: "damaged" | "wrong_item" | "quality_fail" | "expired" | "other";
  notes?: string | null;
  lotNumber?: string | null;
};

export type VendorReturn = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  /** GRN this return reverses. */
  grnId: string;
  supplierId: string;
  warehouseId: string;
  date: ISO8601;
  state: DocState;
  lines: VendorReturnLine[];
  /** Debit Note generated on post (set when state === "posted"). */
  debitNoteId?: string | null;
  notes?: string | null;
};

export type DebitNote = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  supplierId: string;
  /** The Vendor Return that gave rise to this Debit Note. */
  vendorReturnId: string;
  /** The Vendor Bill being debited against (if any). */
  billId?: string | null;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Amount already settled (refund received or netted off a future bill). */
  settled: number;
};

export type VendorPayment = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  supplierId: string;
  bankAccountId: string;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  amount: number;
  allocations: VendorPaymentAllocation[];
  method: "wire" | "cheque" | "cash";
};
