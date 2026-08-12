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
