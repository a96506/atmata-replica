import type { DatabaseSearchResult } from "./search";
import { getReadClient, mapRows, rpcRows } from "@/lib/db/read";

type SearchRpcRow = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  rank: number;
};

/** Matches SQL `p.sku || ' · ' || p.name` title shape from search_all. */
export function productSkuFromSearchTitle(title: string): string | null {
  const sku = title.split(" · ")[0]?.trim();
  return sku ? sku : null;
}

export function productSearchPath(sku: string): string {
  return `/inventory/products/${encodeURIComponent(sku)}`;
}

const PATH_BUILDERS: Record<string, (row: SearchRpcRow) => string | null> = {
  product: (row) => {
    const sku = productSkuFromSearchTitle(row.title);
    return sku ? productSearchPath(sku) : null;
  },
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

async function productSkusById(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const client = await getReadClient();
  const result = await client.database.from("products").select("id, sku").in("id", [...ids]);
  if (result.error) return new Map();
  const rows = mapRows<{ id: string; sku: string }>(result.data ?? []);
  return new Map(rows.map((row) => [row.id, row.sku]));
}

export async function searchDatabase(
  query: string,
  limit: number,
): Promise<DatabaseSearchResult[]> {
  const rows = await rpcRows<SearchRpcRow>("search_all", {
    p_query: query,
    p_limit: limit,
  });

  const missingSkuIds = rows
    .filter((row) => row.type === "product" && !productSkuFromSearchTitle(row.title))
    .map((row) => row.id);
  const skuById = await productSkusById(missingSkuIds);

  return rows.flatMap((row) => {
    const buildPath = PATH_BUILDERS[row.type];
    if (!buildPath) return [];

    let path = buildPath(row);
    if (row.type === "product" && !path) {
      const sku = skuById.get(row.id)?.trim();
      if (!sku) return [];
      path = productSearchPath(sku);
    }
    if (!path) return [];

    return [
      {
        id: `db_${row.type}_${row.id}`,
        kind: row.type === "product" ? "product" : "doc",
        label: row.title,
        ...(row.subtitle ? { subtitle: row.subtitle } : {}),
        path,
        keywords: [row.type, row.id],
      } satisfies DatabaseSearchResult,
    ];
  });
}
