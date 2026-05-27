import {
  INTERNAL_TRANSFERS,
  STOCK_ADJUSTMENTS,
  STOCK_MOVES,
} from "@/mocks/seed/inv";
import type { InternalTransfer, StockAdjustment, StockMove } from "@/types";

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listStockMoves(): Promise<StockMove[]> {
  return STOCK_MOVES;
}

export async function listInternalTransfers(): Promise<InternalTransfer[]> {
  return INTERNAL_TRANSFERS;
}
export async function getInternalTransfer(id: string): Promise<InternalTransfer | null> {
  return byId(INTERNAL_TRANSFERS, id);
}

export async function listStockAdjustments(): Promise<StockAdjustment[]> {
  return STOCK_ADJUSTMENTS;
}
export async function getStockAdjustment(id: string): Promise<StockAdjustment | null> {
  return byId(STOCK_ADJUSTMENTS, id);
}
