import type {
  CustomerInvoice,
  CustomerReceipt,
  DeliveryNote,
  Opportunity,
  Quote,
  SalesOrder,
} from "@/types";
import {
  getReadClient,
  getTable,
  listPage,
  listTable,
  mapRows,
  requireData,
  type ListPageResult,
  type ReadFilter,
} from "@/lib/db/read";
import { Q2C_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

const oppOrder = [
  { column: "number", ascending: false },
  { column: "id" },
];

/** List opportunities (SDK writes gated by RLS: ar_clerk/admin). */
export async function listOpportunities(): Promise<Opportunity[]> {
  return listTable("opportunities", Q2C_SELECTS.opportunities, oppOrder);
}

const ACTIVE_PIPELINE_STAGES = ["qualified", "proposal", "negotiation"] as const;

/** One server page of opportunities (same projection/order as {@link listOpportunities}). */
export async function listOpportunitiesPage(params: {
  limit?: number;
  offset?: number;
  /** When true, exclude won/lost so totals match the active pipeline tab. */
  activeOnly?: boolean;
}): Promise<ListPageResult<Opportunity>> {
  const filters: ReadFilter[] = params.activeOnly
    ? [{ column: "stage", in: [...ACTIVE_PIPELINE_STAGES] }]
    : [];
  return listPage("opportunities", Q2C_SELECTS.opportunities, oppOrder, filters, {
    limit: params.limit,
    offset: params.offset,
  });
}
export async function getOpportunity(id: string): Promise<Opportunity | null> {
  return getTable("opportunities", Q2C_SELECTS.opportunities, id);
}

export async function listQuotes(): Promise<Quote[]> {
  return listTable("quotes", Q2C_SELECTS.quotes, docOrder);
}

/** One server page of quotes (same projection/order as {@link listQuotes}). */
export async function listQuotesPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<Quote>> {
  return listPage("quotes", Q2C_SELECTS.quotes, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getQuote(id: string): Promise<Quote | null> {
  return getTable("quotes", Q2C_SELECTS.quotes, id);
}

export async function listSalesOrders(): Promise<SalesOrder[]> {
  return listTable("sales_orders", Q2C_SELECTS.salesOrders, docOrder);
}

/** One server page of sales orders (same projection/order as {@link listSalesOrders}). */
export async function listSalesOrdersPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<SalesOrder>> {
  return listPage("sales_orders", Q2C_SELECTS.salesOrders, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getSalesOrder(id: string): Promise<SalesOrder | null> {
  return getTable("sales_orders", Q2C_SELECTS.salesOrders, id);
}

/** SO numbers for the given ids only (delivery list joins — not a full SO load). */
export async function mapSalesOrderNumbersByIds(
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("sales_orders")
    .select("id,number")
    .in("id", unique);
  const rows = mapRows<{ id: string; number: string }>(
    requireData(result, "sales_orders"),
  );
  return new Map(rows.map((row) => [row.id, row.number]));
}

export async function listDeliveryNotes(): Promise<DeliveryNote[]> {
  return listTable("delivery_notes", Q2C_SELECTS.deliveryNotes, docOrder);
}

/** One server page of delivery notes (same projection/order as {@link listDeliveryNotes}). */
export async function listDeliveryNotesPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<DeliveryNote>> {
  return listPage("delivery_notes", Q2C_SELECTS.deliveryNotes, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getDeliveryNote(id: string): Promise<DeliveryNote | null> {
  return getTable("delivery_notes", Q2C_SELECTS.deliveryNotes, id);
}

/** Full list for export/lookups (allPages, hard-capped at 1000). */
export async function listCustomerInvoices(options?: {
  state?: string | null;
}): Promise<CustomerInvoice[]> {
  const filters: ReadFilter[] = options?.state
    ? [{ column: "state", value: options.state }]
    : [];
  return listTable(
    "customer_invoices",
    Q2C_SELECTS.customerInvoices,
    docOrder,
    filters,
  );
}

/** One server page of AR invoices (same projection/order as {@link listCustomerInvoices}). */
export async function listCustomerInvoicesPage(params: {
  limit?: number;
  offset?: number;
  /** When set, filter at the DB via `.eq("state", …)`. */
  state?: string | null;
}): Promise<ListPageResult<CustomerInvoice>> {
  const filters: ReadFilter[] = params.state
    ? [{ column: "state", value: params.state }]
    : [];
  return listPage(
    "customer_invoices",
    Q2C_SELECTS.customerInvoices,
    docOrder,
    filters,
    { limit: params.limit, offset: params.offset },
  );
}

export async function getCustomerInvoice(id: string): Promise<CustomerInvoice | null> {
  return getTable("customer_invoices", Q2C_SELECTS.customerInvoices, id);
}

/** Full list for export/lookups (allPages, hard-capped at 1000). */
export async function listCustomerReceipts(): Promise<CustomerReceipt[]> {
  return listTable("customer_receipts", Q2C_SELECTS.customerReceipts, docOrder);
}

/** One server page of AR receipts (same projection/order as {@link listCustomerReceipts}). */
export async function listCustomerReceiptsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<CustomerReceipt>> {
  return listPage("customer_receipts", Q2C_SELECTS.customerReceipts, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}
export async function getCustomerReceipt(id: string): Promise<CustomerReceipt | null> {
  return getTable("customer_receipts", Q2C_SELECTS.customerReceipts, id);
}
