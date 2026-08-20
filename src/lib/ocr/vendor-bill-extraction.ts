/**
 * Normalize OCR jsonb from `ocr-vendor-bill` (nested confidence fields)
 * or legacy flat demo shapes for invoice review UI.
 */

export type OcrExtractionLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number;
  productCode?: string;
};

export type OcrExtractionView = {
  vendor: string;
  vendorVat: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  poReference: string;
  paymentTerms: string;
  notes: string;
  lineItems: OcrExtractionLine[];
  fieldConfidences: Record<string, number>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fieldValue(field: unknown): string {
  if (typeof field === "string") return field.trim();
  const row = asRecord(field);
  if (!row) return "";
  if (typeof row.value === "string") return row.value.trim();
  if (typeof row.name === "string") return row.name.trim();
  return "";
}

function fieldNumber(field: unknown): number {
  if (typeof field === "number" && Number.isFinite(field)) return field;
  const row = asRecord(field);
  if (!row) return 0;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : 0;
}

function fieldConfidence(field: unknown): number {
  const row = asRecord(field);
  if (!row) return 0;
  const n = Number(row.confidence);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function parseOcrExtraction(
  raw: Record<string, unknown> | null | undefined,
): OcrExtractionView {
  const extraction = raw ?? {};
  const supplier = asRecord(extraction.supplier) ?? {};
  const vendor =
    fieldValue(extraction.supplier) ||
    (typeof extraction.vendor === "string" ? extraction.vendor.trim() : "") ||
    (typeof extraction.vendor_name === "string"
      ? extraction.vendor_name.trim()
      : "");

  const linesRaw = Array.isArray(extraction.lines)
    ? extraction.lines
    : Array.isArray(extraction.line_items)
      ? extraction.line_items
      : [];

  const lineItems: OcrExtractionLine[] = linesRaw
    .map((line) => {
      const row = asRecord(line) ?? {};
      const description =
        typeof row.description === "string" ? row.description.trim() : "";
      const quantity = Number(row.quantity ?? row.qty) || 0;
      const unitPrice = Number(row.unitPrice ?? row.unit_price) || 0;
      const total = Number(row.total ?? row.amount) || quantity * unitPrice;
      const confidence = Number(row.confidence) || 0;
      const productCode =
        typeof row.product_code === "string"
          ? row.product_code.trim()
          : typeof row.productCode === "string"
            ? row.productCode.trim()
            : undefined;
      return {
        description,
        quantity,
        unitPrice,
        total,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0,
        ...(productCode ? { productCode } : {}),
      };
    })
    .filter((line) => line.description && line.quantity > 0);

  const fieldConfidences: Record<string, number> = {
    vendor:
      fieldConfidence(extraction.supplier) || Number(supplier.confidence) || 0,
    invoiceNumber: fieldConfidence(extraction.invoiceNumber),
    invoiceDate: fieldConfidence(extraction.invoiceDate),
    currency: fieldConfidence(extraction.currency),
    total: fieldConfidence(extraction.total),
  };
  for (const [i, line] of lineItems.entries()) {
    if (line.confidence > 0) fieldConfidences[`line_${i + 1}`] = line.confidence;
  }

  const invoiceDate =
    fieldValue(extraction.invoiceDate) ||
    (typeof extraction.invoice_date === "string" ? extraction.invoice_date : "");
  const dueDate =
    fieldValue(extraction.dueDate) ||
    (typeof extraction.due_date === "string" ? extraction.due_date : "") ||
    invoiceDate;

  return {
    vendor,
    vendorVat:
      typeof extraction.vendor_vat === "string" ? extraction.vendor_vat : "",
    invoiceNumber:
      fieldValue(extraction.invoiceNumber) ||
      (typeof extraction.invoice_number === "string"
        ? extraction.invoice_number
        : ""),
    invoiceDate,
    dueDate,
    currency:
      fieldValue(extraction.currency) ||
      (typeof extraction.currency === "string" ? extraction.currency : "KWD") ||
      "KWD",
    subtotal:
      fieldNumber(extraction.subtotal) ||
      (typeof extraction.subtotal === "number" ? extraction.subtotal : 0),
    taxAmount:
      fieldNumber(extraction.taxTotal) ||
      (typeof extraction.tax_amount === "number" ? extraction.tax_amount : 0),
    total:
      fieldNumber(extraction.total) ||
      (typeof extraction.total === "number" ? extraction.total : 0),
    poReference:
      typeof extraction.po_reference === "string"
        ? extraction.po_reference
        : typeof extraction.poReference === "string"
          ? extraction.poReference
          : "",
    paymentTerms:
      typeof extraction.payment_terms === "string"
        ? extraction.payment_terms
        : "",
    notes: typeof extraction.notes === "string" ? extraction.notes : "",
    lineItems,
    fieldConfidences,
  };
}
