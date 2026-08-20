import type { InternalTransfer, StockAdjustment, StockMove } from "@/types";
import { getTable, listTable } from "@/lib/db/read";
import { INVENTORY_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

export async function listStockMoves(): Promise<StockMove[]> {
  return listTable("stock_moves", INVENTORY_SELECTS.stockMoves, docOrder);
}

export async function listInternalTransfers(): Promise<InternalTransfer[]> {
  return listTable("internal_transfers", INVENTORY_SELECTS.internalTransfers, docOrder);
}
export async function getInternalTransfer(id: string): Promise<InternalTransfer | null> {
  return getTable("internal_transfers", INVENTORY_SELECTS.internalTransfers, id);
}

export async function listStockAdjustments(): Promise<StockAdjustment[]> {
  return listTable("stock_adjustments", INVENTORY_SELECTS.stockAdjustments, docOrder);
}
export async function getStockAdjustment(id: string): Promise<StockAdjustment | null> {
  return getTable("stock_adjustments", INVENTORY_SELECTS.stockAdjustments, id);
}
