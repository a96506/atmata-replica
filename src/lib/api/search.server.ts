import type { DatabaseSearchResult } from "./search";
import { rpcRows } from "@/lib/db/read";

type SearchRpcRow = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  rank: number;
};

const PATH_BUILDERS: Record<string, (row: SearchRpcRow) => string> = {
  product: (row) =>
    `/inventory/products/${encodeURIComponent(row.title.split(" · ")[0] ?? row.id)}`,
  customer: (row) => `/settings/customers/${row.id}`,
  supplier: (row) => `/settings/suppliers/${row.id}`,
  account: () => "/settings/coa",
  purchase_requisition: (row) => `/purchasing/purchase-requisitions/${row.id}`,
  rfq: (row) => `/purchasing/rfqs/${row.id}`,
  purchase_order: (row) => `/purchasing/purchase-orders/${row.id}`,
  goods_receipt: (row) => `/purchasing/goods-receipts/${row.id}`,
  vendor_bill: (row) => `/purchasing/bills/${row.id}`,
  vendor_payment: (row) => `/purchasing/payments/${row.id}`,
  vendor_return: (row) => `/purchasing/vendor-returns/${row.id}`,
  debit_note: (row) => `/purchasing/debit-notes/${row.id}`,
  quote: (row) => `/sales/quotes/${row.id}`,
  sales_order: (row) => `/sales/orders/${row.id}`,
  delivery_note: (row) => `/sales/deliveries/${row.id}`,
  customer_invoice: (row) => `/sales/invoices/${row.id}`,
  customer_receipt: (row) => `/sales/receipts/${row.id}`,
  customer_return: (row) => `/sales/returns/${row.id}`,
  credit_note: (row) => `/sales/credit-notes/${row.id}`,
  journal_entry: (row) => `/accounting/journal-entries/${row.id}`,
  stock_move: () => "/inventory/stock-moves",
  internal_transfer: (row) => `/inventory/transfers/${row.id}`,
  stock_adjustment: (row) => `/inventory/adjustments/${row.id}`,
};

export async function searchDatabase(
  query: string,
  limit: number,
): Promise<DatabaseSearchResult[]> {
  const rows = await rpcRows<SearchRpcRow>("search_all", {
    p_query: query,
    p_limit: limit,
  });
  return rows.flatMap((row) => {
    const buildPath = PATH_BUILDERS[row.type];
    if (!buildPath) return [];
    return [
      {
        id: `db_${row.type}_${row.id}`,
        kind: row.type === "product" ? "product" : "doc",
        label: row.title,
        ...(row.subtitle ? { subtitle: row.subtitle } : {}),
        path: buildPath(row),
        keywords: [row.type, row.id],
      } satisfies DatabaseSearchResult,
    ];
  });
}
