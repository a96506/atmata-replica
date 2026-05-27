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
