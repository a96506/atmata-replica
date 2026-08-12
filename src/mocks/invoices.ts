export type DocumentJob = {
  job_id: number;
  file_name: string;
  document_type: string;
  status: string;
  confidence: number;
  matched_vendor_name: string;
  extraction: {
    vendor: string;
    total: number;
    currency: string;
  } | null;
  created_at: string | null;
  /** Set by the OCR edge function once a vendor bill is created from the job. */
  matched_doc_id?: string | null;
};

export const DEMO_INVOICES: DocumentJob[] = [
  {
    job_id: 9001,
    file_name: "supplier_kw_042.pdf",
    document_type: "invoice",
    status: "review_needed",
    confidence: 0.88,
    matched_vendor_name: "Gulf Supplies WLL",
    extraction: { vendor: "Gulf Supplies WLL", total: 1240.5, currency: "KWD" },
    created_at: new Date().toISOString(),
  },
  {
    job_id: 9002,
    file_name: "utilities_jan.pdf",
    document_type: "invoice",
    status: "completed",
    confidence: 0.95,
    matched_vendor_name: "Ministry utilities",
    extraction: {
      vendor: "Ministry utilities",
      total: 310.25,
      currency: "KWD",
    },
    created_at: new Date(Date.now() - 86400_000).toISOString(),
  },
];

export const DEMO_INVOICE_DETAIL: Record<
  string,
  DocumentJob & {
    field_confidences: Record<string, number>;
    odoo_record_created: number | null;
    error_message: string | null;
    processing_time_ms: number | null;
    extraction_full: {
      vendor: string;
      vendor_vat: string;
      invoice_number: string;
      invoice_date: string;
      due_date: string;
      currency: string;
      subtotal: number;
      tax_amount: number;
      total: number;
      po_reference: string;
      line_items: Array<{
        description: string;
        quantity: number;
        unit_price: number;
        amount: number;
        product_code: string;
      }>;
      payment_terms: string;
      notes: string;
    };
  }
> = {
  "9001": {
    ...DEMO_INVOICES[0],
    field_confidences: { vendor: 0.97, total: 0.9, tax: 0.86, date: 0.92 },
    odoo_record_created: null,
    error_message: null,
    processing_time_ms: 842,
    extraction_full: {
      vendor: "Gulf Supplies WLL",
      vendor_vat: "KW123456789",
      invoice_number: "INV-77821",
      invoice_date: "2026-04-28",
      due_date: "2026-05-28",
      currency: "KWD",
      subtotal: 1181.429,
      tax_amount: 59.071,
      total: 1240.5,
      po_reference: "PO-7781",
      line_items: [
        {
          description: "Office supplies — April",
          quantity: 1,
          unit_price: 1181.429,
          amount: 1181.429,
          product_code: "CONS-001",
        },
      ],
      payment_terms: "Net 30",
      notes: "",
    },
  },
  "9002": {
    ...DEMO_INVOICES[1],
    field_confidences: { vendor: 0.99, total: 0.96 },
    odoo_record_created: 551,
    error_message: null,
    processing_time_ms: 410,
    extraction_full: {
      vendor: "Ministry utilities",
      vendor_vat: "KW998877665",
      invoice_number: "UTIL-042",
      invoice_date: "2026-03-01",
      due_date: "2026-03-15",
      currency: "KWD",
      subtotal: 295.476,
      tax_amount: 14.774,
      total: 310.25,
      po_reference: "",
      line_items: [
        {
          description: "Electricity — March",
          quantity: 1,
          unit_price: 295.476,
          amount: 295.476,
          product_code: "UTIL-E",
        },
      ],
      payment_terms: "Due on receipt",
      notes: "",
    },
  },
};
