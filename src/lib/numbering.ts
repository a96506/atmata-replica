import type { DocType } from "@/types";

export type SequenceFormat = {
  docType: DocType;
  prefix: string;
  year: number;
  padding: number;
};

export function renderSequence(fmt: SequenceFormat, seq: number): string {
  const padded = String(seq).padStart(fmt.padding, "0");
  return `${fmt.prefix}-${fmt.year}-${padded}`;
}

export const DEFAULT_SEQUENCE_PREFIX: Record<DocType, { prefix: string; padding: number }> = {
  pr: { prefix: "PR", padding: 5 },
  rfq: { prefix: "RFQ", padding: 5 },
  po: { prefix: "PO", padding: 5 },
  grn: { prefix: "GRN", padding: 5 },
  vendor_bill: { prefix: "BILL", padding: 5 },
  vendor_payment: { prefix: "VPAY", padding: 5 },
  debit_note: { prefix: "DBN", padding: 5 },
  vendor_return: { prefix: "VRET", padding: 5 },
  opportunity: { prefix: "OPP", padding: 5 },
  quote: { prefix: "QT", padding: 5 },
  so: { prefix: "SO", padding: 5 },
  dn: { prefix: "DEL", padding: 5 },
  customer_invoice: { prefix: "INV", padding: 5 },
  customer_receipt: { prefix: "RCP", padding: 5 },
  credit_note: { prefix: "CRN", padding: 5 },
  customer_return: { prefix: "CRET", padding: 5 },
  journal_entry: { prefix: "JE", padding: 5 },
  stock_move: { prefix: "SM", padding: 6 },
  stock_adjustment: { prefix: "ADJ", padding: 5 },
  internal_transfer: { prefix: "TRX", padding: 5 },
};

export function previewSequence(docType: DocType, year: number, nextSeq: number): string {
  const { prefix, padding } = DEFAULT_SEQUENCE_PREFIX[docType];
  return renderSequence({ docType, prefix, padding, year }, nextSeq);
}
