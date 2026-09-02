import type {
  BankAccount,
  Branch,
  Company,
  Customer,
  FiscalPeriod,
  Location,
  PaymentTerm,
  Product,
  Supplier,
  TaxCode,
  Warehouse,
} from "@/types";
import {
  getReadClient,
  getTable,
  listPage,
  listTable,
  mapRows,
  requireData,
  rpcData,
  type ListPageParams,
  type ListPageResult,
} from "@/lib/db/read";
import { MASTER_SELECTS } from "@/lib/db/selects";
import type { PriceListRow } from "@/lib/price-lists";

export type { PriceListRow } from "@/lib/price-lists";
export { pickActivePriceList } from "@/lib/price-lists";

const byName = [{ column: "name" }, { column: "id" }] as const;
const byCode = [{ column: "code" }, { column: "id" }] as const;
const docOrders = (orders: readonly { column: string; ascending?: boolean }[]) =>
  orders.map((order) => ({ ...order }));

/** Hard-capped via listTable — move to server-side pagination when a tenant table exceeds 1000 rows. */
export async function listCompanies(): Promise<Company[]> {
  return listTable("companies", MASTER_SELECTS.companies, docOrders(byName));
}
export async function getCompany(id: string): Promise<Company | null> {
  return getTable("companies", MASTER_SELECTS.companies, id);
}

/** Hard-capped via listTable — move to server-side pagination when a tenant table exceeds 1000 rows. */
export async function listBranches(): Promise<Branch[]> {
  return listTable("branches", MASTER_SELECTS.branches, docOrders(byName));
}

/** Full list for dropdowns/lookups (allPages, hard-capped at 1000). */
export async function listCustomers(): Promise<Customer[]> {
  return listTable("customers", MASTER_SELECTS.customers, docOrders(byName));
}
/** One server page for the customers settings list UI. */
export async function listCustomersPage(
  params?: ListPageParams,
): Promise<ListPageResult<Customer>> {
  return listPage(
    "customers",
    MASTER_SELECTS.customers,
    docOrders(byName),
    [],
    params,
  );
}
export async function getCustomer(id: string): Promise<Customer | null> {
  return getTable("customers", MASTER_SELECTS.customers, id);
}

/** Names for the given customer ids only (invoice list joins — not a full master load). */
export async function mapCustomerNamesByIds(
  ids: string[],
): Promise<Map<string, string>> {
  return mapPartyNamesByIds("customers", ids);
}

/** Full list for dropdowns/lookups (allPages, hard-capped at 1000). */
export async function listSuppliers(): Promise<Supplier[]> {
  return listTable("suppliers", MASTER_SELECTS.suppliers, docOrders(byName));
}
/** One server page for the suppliers settings list UI. */
export async function listSuppliersPage(
  params?: ListPageParams,
): Promise<ListPageResult<Supplier>> {
  return listPage(
    "suppliers",
    MASTER_SELECTS.suppliers,
    docOrders(byName),
    [],
    params,
  );
}
export async function getSupplier(id: string): Promise<Supplier | null> {
  return getTable("suppliers", MASTER_SELECTS.suppliers, id);
}

/** Names for the given supplier ids only (bill list joins — not a full master load). */
export async function mapSupplierNamesByIds(
  ids: string[],
): Promise<Map<string, string>> {
  return mapPartyNamesByIds("suppliers", ids);
}

async function mapPartyNamesByIds(
  table: "customers" | "suppliers",
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from(table)
    .select("id,name")
    .in("id", unique);
  const rows = mapRows<{ id: string; name: string }>(
    requireData(result, table),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

// Remaining master/settings lists (not customers/suppliers): hard-capped via listTable/ALL_PAGES_HARD_CAP.
// Move to server-side pagination when a tenant table exceeds 1000 rows.

export async function listProducts(): Promise<Product[]> {
  return listTable("products", MASTER_SELECTS.products, [
    { column: "sku" },
    { column: "id" },
  ]);
}
export async function getProduct(id: string): Promise<Product | null> {
  return getTable("products", MASTER_SELECTS.products, id);
}

export async function listWarehouses(): Promise<Warehouse[]> {
  return listTable("warehouses", MASTER_SELECTS.warehouses, docOrders(byCode));
}
export async function getWarehouse(id: string): Promise<Warehouse | null> {
  return getTable("warehouses", MASTER_SELECTS.warehouses, id);
}

export async function listLocations(): Promise<Location[]> {
  return listTable("locations", MASTER_SELECTS.locations, docOrders(byCode));
}

export async function listTaxCodes(): Promise<TaxCode[]> {
  return listTable("tax_codes", MASTER_SELECTS.tax_codes, docOrders(byCode));
}
export async function getTaxCode(id: string): Promise<TaxCode | null> {
  return getTable("tax_codes", MASTER_SELECTS.tax_codes, id);
}

export async function listPaymentTerms(): Promise<PaymentTerm[]> {
  return listTable("payment_terms", MASTER_SELECTS.payment_terms, docOrders(byCode));
}
export async function getPaymentTerm(id: string): Promise<PaymentTerm | null> {
  return getTable("payment_terms", MASTER_SELECTS.payment_terms, id);
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  return listTable("bank_accounts", MASTER_SELECTS.bank_accounts, docOrders(byName));
}
export async function getBankAccount(id: string): Promise<BankAccount | null> {
  return getTable("bank_accounts", MASTER_SELECTS.bank_accounts, id);
}

export async function listFiscalPeriods(): Promise<FiscalPeriod[]> {
  return listTable("fiscal_periods", MASTER_SELECTS.fiscal_periods, [
    { column: "year", ascending: false },
    { column: "month", ascending: false },
    { column: "id" },
  ]);
}


export type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  active: boolean;
};

export async function listCurrencies(): Promise<CurrencyRow[]> {
  return listTable("currencies", MASTER_SELECTS.currencies, [
    { column: "code", ascending: true },
  ]);
}

export type FxRateRow = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
};

export async function listFxRates(): Promise<FxRateRow[]> {
  return listTable("fx_rates", MASTER_SELECTS.fx_rates, [
    { column: "rate_date", ascending: false },
    { column: "id" },
  ]);
}

export class FxRateNotFoundError extends Error {
  readonly code = "FX_RATE_NOT_FOUND" as const;
  constructor(
    readonly from: string,
    readonly to: string,
    readonly date?: string,
  ) {
    super(
      date
        ? `No FX rate for ${from}→${to} as of ${date}`
        : `No FX rate for ${from}→${to}`,
    );
    this.name = "FxRateNotFoundError";
  }
}

export async function getFxRate(
  from: string,
  to: string,
  date?: string,
): Promise<number> {
  if (from === to) return 1;
  const rows = await listFxRates();
  const candidates = rows
    .filter(
      (r) =>
        r.baseCurrency === from &&
        r.quoteCurrency === to &&
        (!date || r.rateDate <= date),
    )
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate));
  const rate = candidates[0]?.rate;
  if (rate == null) {
    throw new FxRateNotFoundError(from, to, date);
  }
  return rate;
}

export type ApprovalRuleRow = {
  id: string;
  docType: string;
  minAmount: number;
  maxAmount: number | null;
  approverRoles: string[];
  sequence: number;
  active: boolean;
};

export async function listApprovalRules(): Promise<ApprovalRuleRow[]> {
  return listTable("approval_rules", MASTER_SELECTS.approval_rules, [
    { column: "doc_type" },
    { column: "sequence" },
    { column: "id" },
  ]);
}

export async function listPriceLists(): Promise<PriceListRow[]> {
  return listTable("price_lists", MASTER_SELECTS.price_lists, [
    { column: "name" },
    { column: "id" },
  ]);
}

export async function getPriceList(id: string): Promise<PriceListRow | null> {
  return getTable("price_lists", MASTER_SELECTS.price_lists, id);
}

export type PriceListItemRow = {
  id: string;
  priceListId: string;
  productId: string;
  unitPrice: number;
  minQty: number;
};

export async function listPriceListItems(
  priceListId: string,
): Promise<PriceListItemRow[]> {
  return listTable(
    "price_list_items",
    MASTER_SELECTS.price_list_items,
    [
      { column: "product_id" },
      { column: "min_qty" },
      { column: "id" },
    ],
    [{ column: "price_list_id", value: priceListId }],
  );
}

export type ResolvedPriceListItem = {
  priceListId: string;
  priceListItemId: string;
  productId: string;
  quantity: number;
  minQty: number;
  unitPrice: number;
  currency: string;
};

/**
 * Read-only RPC `resolve_price_list_item`. Returns null when no active list
 * line matches (RPC raises); callers fall back to product default sale price.
 * @see https://docs.insforge.dev/sdks/typescript/database — database.rpc
 */
export async function resolvePriceListItem(args: {
  priceListId: string;
  productId: string;
  qty: number;
  onDate?: string;
}): Promise<ResolvedPriceListItem | null> {
  try {
    return await rpcData<ResolvedPriceListItem>("resolve_price_list_item", {
      p_price_list_id: args.priceListId,
      p_product_id: args.productId,
      p_qty: args.qty,
      ...(args.onDate ? { p_on_date: args.onDate } : {}),
    });
  } catch {
    return null;
  }
}

export type DocumentSequenceRow = {
  id: string;
  docType: string;
  prefix: string;
  year: number;
  padding: number;
  nextNumber: number;
};

export async function listDocumentSequences(): Promise<DocumentSequenceRow[]> {
  return listTable("document_sequences", MASTER_SELECTS.document_sequences, [
    { column: "doc_type" },
    { column: "year", ascending: false },
    { column: "id" },
  ]);
}

export function resolveApprovalChain(
  rules: ApprovalRuleRow[],
  docType: string,
  amount: number,
): ApprovalRuleRow[] {
  return rules
    .filter(
      (r) =>
        r.active &&
        r.docType === docType &&
        amount >= r.minAmount &&
        (r.maxAmount == null || amount <= r.maxAmount),
    )
    .sort((a, b) => a.sequence - b.sequence || a.minAmount - b.minAmount);
}
