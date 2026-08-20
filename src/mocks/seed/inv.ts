import type { InternalTransfer, StockAdjustment, StockMove } from "@/types";

/**
 * Stock moves are auto-derived from posted business documents in a real ERP;
 * here we seed them explicitly so the inventory ledger lines up with the
 * postings above. Source links are followed by the related-docs rail.
 */
export const STOCK_MOVES: StockMove[] = [
  // GRN-2026-00001 receipt of 80 Resin
  {
    id: "sm_1",
    number: "SM-000001",
    date: "2026-04-18",
    productId: "prod_1",
    warehouseId: "wh_1",
    direction: "in",
    qty: 80,
    costPerUnit: 12.4,
    sourceType: "grn",
    sourceId: "grn_1",
  },
  // GRN-2026-00002 receipt of 500 Cartons
  {
    id: "sm_2",
    number: "SM-000002",
    date: "2026-04-19",
    productId: "prod_2",
    warehouseId: "wh_1",
    direction: "in",
    qty: 500,
    costPerUnit: 0.35,
    sourceType: "grn",
    sourceId: "grn_2",
  },
  // DEL-2026-00001 shipment of 2 Display coolers
  {
    id: "sm_3",
    number: "SM-000003",
    date: "2026-04-12",
    productId: "prod_4",
    warehouseId: "wh_2",
    direction: "out",
    qty: 2,
    costPerUnit: 620,
    lotNumber: "DC-2026-Q2",
    sourceType: "delivery_note",
    sourceId: "dn_1",
  },
  // Internal transfer 4 Display coolers wh_1 → wh_2 (showroom restock)
  {
    id: "sm_4",
    number: "SM-000004",
    date: "2026-04-09",
    productId: "prod_4",
    warehouseId: "wh_1",
    direction: "out",
    qty: 4,
    costPerUnit: 620,
    sourceType: "internal_transfer",
    sourceId: "trx_1",
  },
  {
    id: "sm_5",
    number: "SM-000005",
    date: "2026-04-10",
    productId: "prod_4",
    warehouseId: "wh_2",
    direction: "in",
    qty: 4,
    costPerUnit: 620,
    sourceType: "internal_transfer",
    sourceId: "trx_1",
  },
  // Stock adjustment — 6 thermal label rolls scrapped (damage)
  {
    id: "sm_6",
    number: "SM-000006",
    date: "2026-04-20",
    productId: "prod_3",
    warehouseId: "wh_1",
    direction: "out",
    qty: 6,
    costPerUnit: 8.75,
    sourceType: "stock_adjustment",
    sourceId: "adj_1",
  },
];

export const INTERNAL_TRANSFERS: InternalTransfer[] = [
  {
    id: "trx_1",
    rowVersion: 1,
    number: "TRX-2026-00001",
    companyId: "co_1",
    fromWarehouseId: "wh_1",
    toWarehouseId: "wh_2",
    date: "2026-04-09",
    state: "posted",
    lines: [
      { id: "trx_1_l1", productId: "prod_4", qty: 4, lotNumber: "DC-2026-Q2" },
    ],
    notes: "Showroom restock ahead of Kuwait Retail delivery.",
  },
];

export const STOCK_ADJUSTMENTS: StockAdjustment[] = [
  {
    id: "adj_1",
    rowVersion: 1,
    number: "ADJ-2026-00001",
    companyId: "co_1",
    date: "2026-04-20",
    state: "posted",
    approvedBy: "Demo User",
    lines: [
      {
        id: "adj_1_l1",
        productId: "prod_3",
        warehouseId: "wh_1",
        qtyDelta: -6,
        reason: "damage",
      },
    ],
    notes: "Water damage during April rain.",
  },
];
