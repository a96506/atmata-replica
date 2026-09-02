import type { InternalTransfer, StockAdjustment, StockMove } from "@/types";
import {
  getTable,
  listPage,
  listTable,
  type ListPageParams,
  type ListPageResult,
  type ReadFilter,
} from "@/lib/db/read";
import { INVENTORY_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

/** Full list capped at 1000 via `listTable` / `allPages`. Prefer `listStockMovesPage` for UI lists. */
export async function listStockMoves(): Promise<StockMove[]> {
  return listTable("stock_moves", INVENTORY_SELECTS.stockMoves, docOrder);
}

/** One server page of stock moves (default 50). Optional product/warehouse filters at the DB. */
export async function listStockMovesPage(
  params?: ListPageParams & { productId?: string; warehouseId?: string },
): Promise<ListPageResult<StockMove>> {
  const filters: ReadFilter[] = [];
  if (params?.productId) {
    filters.push({ column: "product_id", value: params.productId });
  }
  if (params?.warehouseId) {
    filters.push({ column: "warehouse_id", value: params.warehouseId });
  }
  return listPage(
    "stock_moves",
    INVENTORY_SELECTS.stockMoves,
    docOrder,
    filters,
    { limit: params?.limit, offset: params?.offset },
  );
}

/** Full list capped at 1000 via `listTable` / `allPages`. Prefer `listInternalTransfersPage` for UI lists. */
export async function listInternalTransfers(): Promise<InternalTransfer[]> {
  return listTable("internal_transfers", INVENTORY_SELECTS.internalTransfers, docOrder);
}

/** One server page of internal transfers (default 50). */
export async function listInternalTransfersPage(
  params?: ListPageParams,
): Promise<ListPageResult<InternalTransfer>> {
  return listPage(
    "internal_transfers",
    INVENTORY_SELECTS.internalTransfers,
    docOrder,
    [],
    { limit: params?.limit, offset: params?.offset },
  );
}

export async function getInternalTransfer(id: string): Promise<InternalTransfer | null> {
  return getTable("internal_transfers", INVENTORY_SELECTS.internalTransfers, id);
}

/** Full list capped at 1000 via `listTable` / `allPages`. Prefer `listStockAdjustmentsPage` for UI lists. */
export async function listStockAdjustments(): Promise<StockAdjustment[]> {
  return listTable("stock_adjustments", INVENTORY_SELECTS.stockAdjustments, docOrder);
}

/** One server page of stock adjustments (default 50). */
export async function listStockAdjustmentsPage(
  params?: ListPageParams,
): Promise<ListPageResult<StockAdjustment>> {
  return listPage(
    "stock_adjustments",
    INVENTORY_SELECTS.stockAdjustments,
    docOrder,
    [],
    { limit: params?.limit, offset: params?.offset },
  );
}
export async function getStockAdjustment(id: string): Promise<StockAdjustment | null> {
  return getTable("stock_adjustments", INVENTORY_SELECTS.stockAdjustments, id);
}
