import type { DocState, ISO8601 } from "../common";

export type StockMoveDirection = "in" | "out";

export type StockMove = {
  id: string;
  number: string;
  date: ISO8601;
  productId: string;
  warehouseId: string;
  direction: StockMoveDirection;
  qty: number;
  costPerUnit: number;
  lotNumber?: string | null;
  /** What produced this move — used by the related-docs rail. */
  sourceType:
    | "grn"
    | "delivery_note"
    | "internal_transfer"
    | "stock_adjustment"
    | "customer_return"
    | "vendor_return";
  sourceId: string;
};

export type InternalTransferLine = {
  id: string;
  productId: string;
  qty: number;
  lotNumber?: string | null;
};

export type InternalTransfer = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  date: ISO8601;
  state: DocState;
  lines: InternalTransferLine[];
  notes?: string | null;
};

export type StockAdjustmentReason =
  | "cycle_count"
  | "damage"
  | "expiry"
  | "theft"
  | "other";

export type StockAdjustmentLine = {
  id: string;
  productId: string;
  warehouseId: string;
  qtyDelta: number;
  reason: StockAdjustmentReason;
};

export type StockAdjustment = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  date: ISO8601;
  state: DocState;
  lines: StockAdjustmentLine[];
  approvedBy?: string | null;
  notes?: string | null;
};
