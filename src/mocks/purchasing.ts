export const DEMO_PURCHASING = {
  po_suggestions: [
    { id: "PS-001", product: "Raw material — resin (25kg)", vendor: "PetroChem Gulf", qty: 80, est_unit: 12.4, severity: "high" },
    { id: "PS-002", product: "Packaging — carton (L)", vendor: "PackLine KW", qty: 500, est_unit: 0.35, severity: "medium" },
    { id: "PS-003", product: "Labels — thermal roll", vendor: "PrintHub", qty: 40, est_unit: 8.75, severity: "low" },
  ],
  bill_matches: [
    { id: "VB-4410", vendor: "PetroChem Gulf", bill_ref: "BILL/2026/031", po_ref: "PO-7710", status: "matched", discrepancy: null as string | null },
    { id: "VB-4412", vendor: "PackLine KW", bill_ref: "BILL/2026/032", po_ref: "PO-7702", status: "discrepancy", discrepancy: "Billed 520, GRN 500" as string | null },
    { id: "VB-4413", vendor: "Gulf Supplies WLL", bill_ref: "BILL/2026/033", po_ref: "PO-7781", status: "review", discrepancy: null as string | null },
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
    { ref: "WH/IN/02655", po: "PO-7710", status: "ready", expected: 80, received: 0, flag: null as string | null },
  ],
};
