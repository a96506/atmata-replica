/** Static fixtures for UI-only preview (no API). */

export type InboxItem = {
  id: number;
  source: string;
  title: string;
  ai_reasoning?: string | null;
  confidence?: number | null;
  suggested_action?: string | null;
  severity?: string | null;
  created_at: string;
  source_url?: string | null;
};

export const DEMO_INBOX: { items: InboxItem[]; by_source: Record<string, number> } = {
  items: [
    {
      id: 101,
      source: "audit_log",
      title: "Post vendor bill INV/2026/0042",
      ai_reasoning: "Line totals match PO-7781; tax 5% applied per Kuwait rules.",
      confidence: 0.91,
      severity: "medium",
      created_at: new Date().toISOString(),
      source_url: null,
    },
    {
      id: 55,
      source: "document_processing",
      title: "Review extracted invoice — ACME Trading.pdf",
      ai_reasoning: "Vendor VAT format valid; due date within terms.",
      confidence: 0.84,
      severity: "low",
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      source_url: null,
    },
    {
      id: 12,
      source: "reconciliation",
      title: "Bank session #12 — 3 medium-confidence matches",
      ai_reasoning: null,
      confidence: 0.72,
      severity: "high",
      created_at: new Date(Date.now() - 7200_000).toISOString(),
      source_url: null,
    },
  ],
  by_source: { audit_log: 1, document_processing: 1, reconciliation: 1 },
};

export const DEMO_STATS = {
  total_automations: 1284,
  pending_approvals: 3,
  success_rate: 0.943,
  time_saved_hours: 412,
};

export const DEMO_CFO = {
  cash_position: { current: 184_320.125, bank_balance: 160_000, ar: 42_000, ap: 17_680 },
  revenue: { mtd: 96_540.75, ytd: 1_020_400, vs_last_month: 4.2 },
  ar_aging: [
    { bucket: "0-30", amount: 28_400 },
    { bucket: "31-60", amount: 9_200 },
    { bucket: "61-90", amount: 3_150 },
    { bucket: "90+", amount: 1_250 },
  ],
  alerts: [
    { severity: "medium", message: "Two bills awaiting 3-way match for PO-7710." },
    { severity: "low", message: "Depreciation run not posted for January (optional)." },
  ],
};

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
    extraction: { vendor: "Ministry utilities", total: 310.25, currency: "KWD" },
    created_at: new Date(Date.now() - 86400_000).toISOString(),
  },
];

export const DEMO_INVOICE_DETAIL: Record<string, DocumentJob & {
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
}> = {
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

export type MatchSuggestion = {
  bank_line_id: number;
  bank_ref: string;
  bank_amount: number;
  matched_entry_id: number | null;
  matched_entry_ref: string;
  matched_amount: number;
  confidence: number;
  match_type: string;
  reasoning: string;
};

export const DEMO_RECON_SUGGESTIONS: MatchSuggestion[] = [
  {
    bank_line_id: 1,
    bank_ref: "NBK-TRF-9912",
    bank_amount: 2500,
    matched_entry_id: 4401,
    matched_entry_ref: "BNK/2026/00044",
    matched_amount: 2500,
    confidence: 0.94,
    match_type: "exact",
    reasoning: "Amount and reference token match.",
  },
  {
    bank_line_id: 2,
    bank_ref: "POS-7721",
    bank_amount: 18.75,
    matched_entry_id: null,
    matched_entry_ref: "",
    matched_amount: 0,
    confidence: 0.61,
    match_type: "fuzzy",
    reasoning: "Possible fee line; needs review.",
  },
];

export const DEMO_THRESHOLDS = {
  items: [
    {
      automation_type: "accounting",
      default_threshold: 0.75,
      auto_approve_threshold: 0.92,
      is_default: true,
    },
    {
      automation_type: "document_processing",
      default_threshold: 0.7,
      auto_approve_threshold: 0.9,
      is_default: false,
    },
    {
      automation_type: "reconciliation",
      default_threshold: 0.8,
      auto_approve_threshold: 0.95,
      is_default: true,
    },
  ],
  platform_defaults: { default_threshold: 0.75, auto_approve_threshold: 0.92 },
};

export const DEMO_FINANCIALS = {
  statement_type: "Profit & Loss",
  period: "2026-04",
  currency: "KWD",
  line_items: [
    { label: "Revenue", amount: 96_540.75, formatted: "KWD 96,540.750" },
    { label: "Cost of sales", amount: -52_100.25, formatted: "KWD -52,100.250" },
    { label: "---Gross profit", amount: 44_440.5, formatted: "KWD 44,440.500" },
    { label: "Operating expenses", amount: -18_320.5, formatted: "KWD -18,320.500" },
    { label: "---Operating income", amount: 26_120, formatted: "KWD 26,120.000" },
  ],
  formatted_totals: { "Net income": "KWD 26,120.000" },
  totals: { net_income: 26_120 },
  generated_at: new Date().toISOString(),
  notes: ["Posted entries only.", "KWD, 3 decimal places."],
};

export const DEMO_CLOSING = {
  closing_id: 1,
  period: "2026-04",
  status: "in_progress",
  overall_progress_pct: 40,
  summary: "Bank reconciliation complete; two vendor bills still in draft.",
  started_at: new Date().toISOString(),
  completed_at: null as string | null,
  steps: [
    { step_name: "reconcile_bank", step_order: 1, status: "complete", items_found: 12, items_resolved: 12, notes: null },
    { step_name: "review_stale_drafts", step_order: 2, status: "needs_attention", items_found: 4, items_resolved: 1, notes: "2 bills >14d" },
    { step_name: "missing_vendor_bills", step_order: 3, status: "pending", items_found: 0, items_resolved: 0, notes: null },
    { step_name: "tax_validation", step_order: 4, status: "pending", items_found: 0, items_resolved: 0, notes: null },
    { step_name: "final_review", step_order: 10, status: "pending", items_found: 0, items_resolved: 0, notes: null },
  ],
};

/** Sales workspace (PRD §5.2 Sales View + §4.2) */
export const DEMO_SALES = {
  summary: { pending_quotes: 3, overdue_customers: 2, credit_holds: 1 },
  quotations: [
    { id: "Q-2026-014", customer: "Kuwait Retail Co.", total: 4_820.5, status: "sent", valid_until: "2026-05-20" },
    { id: "Q-2026-015", customer: "Gulf Foods WLL", total: 12_100, status: "draft", valid_until: "2026-05-25" },
    { id: "Q-2026-012", customer: "City Pharmacy", total: 2_340.75, status: "sent", valid_until: "2026-05-08" },
  ],
  orders: [
    { id: "SO-8891", customer: "Kuwait Retail Co.", total: 8_200, state: "confirmed", delivery_eta: "2026-05-12", exceptional: false },
    { id: "SO-8892", customer: "Project Alpha JV", total: 48_000, state: "confirmed", delivery_eta: "2026-06-01", exceptional: true },
    { id: "SO-8888", customer: "Gulf Foods WLL", total: 3_410.25, state: "draft", delivery_eta: null, exceptional: false },
  ],
  customers: [
    { name: "Kuwait Retail Co.", credit_limit: 25_000, exposure: 18_420, score: "A", payment_status: "current" },
    { name: "Gulf Foods WLL", credit_limit: 40_000, exposure: 38_900, score: "B", payment_status: "overdue_14" },
    { name: "City Pharmacy", credit_limit: 15_000, exposure: 14_200, score: "A", payment_status: "current" },
    { name: "Project Alpha JV", credit_limit: 60_000, exposure: 62_500, score: "C", payment_status: "on_hold" },
  ],
  pipeline: [
    { deal: "POS rollout — Phase 2", stage: "Proposal", value: 22_000, probability: 0.45, days_idle: 5, next_action: "Send revised pricing" },
    { deal: "Annual supply — beverages", stage: "Negotiation", value: 55_000, probability: 0.7, days_idle: 18, next_action: "Legal review of terms" },
    { deal: "Warehouse shelving", stage: "Qualified", value: 8_500, probability: 0.25, days_idle: 21, next_action: "Schedule site visit" },
  ],
  quick_quote_products: [
    { sku: "SKU-104", label: "Display cooler — 2 door", suggested_unit: 890, qty: 2 },
    { sku: "SKU-220", label: "Barcode scanner kit", suggested_unit: 42.5, qty: 5 },
  ],
};

/** Purchasing workspace (PRD Procurement View + §4.3) */
export const DEMO_PURCHASING = {
  po_suggestions: [
    { id: "PS-001", product: "Raw material — resin (25kg)", vendor: "PetroChem Gulf", qty: 80, est_unit: 12.4, severity: "high" },
    { id: "PS-002", product: "Packaging — carton (L)", vendor: "PackLine KW", qty: 500, est_unit: 0.35, severity: "medium" },
    { id: "PS-003", product: "Labels — thermal roll", vendor: "PrintHub", qty: 40, est_unit: 8.75, severity: "low" },
  ],
  bill_matches: [
    { id: "VB-4410", vendor: "PetroChem Gulf", bill_ref: "BILL/2026/031", po_ref: "PO-7710", status: "matched", discrepancy: null as string | null },
    { id: "VB-4412", vendor: "PackLine KW", bill_ref: "BILL/2026/032", po_ref: "PO-7702", status: "discrepancy", discrepancy: "Billed 520, GRN 500" },
    { id: "VB-4413", vendor: "Gulf Supplies WLL", bill_ref: "BILL/2026/033", po_ref: "PO-7781", status: "review", discrepancy: null },
  ],
  price_alerts: [
    { vendor: "PetroChem Gulf", product: "Resin 25kg", change_pct: 8.2, note: "Above 90d moving average" },
    { vendor: "PrintHub", product: "Thermal labels", change_pct: 3.1, note: "Within tolerance" },
  ],
  purchase_history: [
    { date: "2026-05-01", po: "PO-7702", vendor: "PackLine KW", amount: 612.5 },
    { date: "2026-04-28", po: "PO-7701", vendor: "PetroChem Gulf", amount: 4_020 },
    { date: "2026-04-22", po: "PO-7690", vendor: "PrintHub", amount: 210.25 },
  ],
  vendor_scores: [
    { vendor: "PetroChem Gulf", score: 86, lead_days: 6, quality: "high", price_rank: 1 },
    { vendor: "PackLine KW", score: 79, lead_days: 3, quality: "high", price_rank: 2 },
    { vendor: "PrintHub", score: 72, lead_days: 4, quality: "medium", price_rank: 3 },
  ],
  receiving: [
    { ref: "WH/IN/02654", po: "PO-7702", status: "partial", expected: 520, received: 500, flag: "short" as string | null },
    { ref: "WH/IN/02655", po: "PO-7710", status: "ready", expected: 80, received: 0, flag: null },
  ],
};

/** Inventory workspace (PRD §3.4) */
export const DEMO_INVENTORY = {
  stock: [
    { sku: "RM-01", name: "Resin 25kg", on_hand: 42, min: 60, max: 200, abc: "A" as const },
    { sku: "PKG-L", name: "Carton large", on_hand: 1200, min: 800, max: 4000, abc: "B" as const },
    { sku: "LBL-T", name: "Thermal label roll", on_hand: 18, min: 24, max: 120, abc: "C" as const },
    { sku: "SKU-104", name: "Display cooler 2-door", on_hand: 4, min: 2, max: 10, abc: "B" as const },
  ],
  reorder_alerts: [
    { sku: "RM-01", name: "Resin 25kg", short_by: 18, severity: "critical" },
    { sku: "LBL-T", name: "Thermal label roll", short_by: 6, severity: "medium" },
  ],
  forecasts: [
    { sku: "RM-01", name: "Resin 25kg", d30: 95, d90: 280 },
    { sku: "PKG-L", name: "Carton large", d30: 2100, d90: 6200 },
    { sku: "LBL-T", name: "Thermal label roll", d30: 44, d90: 128 },
    { sku: "SKU-104", name: "Display cooler 2-door", d30: 6, d90: 14 },
  ],
  inbound: [
    { ref: "WH/IN/02654", po: "PO-7702", partner: "PackLine KW", eta: "2026-05-11", state: "late" },
    { ref: "WH/IN/02655", po: "PO-7710", partner: "PetroChem Gulf", eta: "2026-05-09", state: "on_track" },
  ],
  outbound: [
    { ref: "WH/OUT/01402", so: "SO-8891", partner: "Kuwait Retail Co.", ship_date: "2026-05-10", state: "delayed" },
    { ref: "WH/OUT/01403", so: "SO-8888", partner: "Gulf Foods WLL", ship_date: "2026-05-12", state: "ready" },
  ],
};
