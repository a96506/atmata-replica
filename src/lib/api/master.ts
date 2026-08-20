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
import { getTable, listTable } from "@/lib/db/read";
import { MASTER_SELECTS } from "@/lib/db/selects";

const byName = [{ column: "name" }, { column: "id" }] as const;
const byCode = [{ column: "code" }, { column: "id" }] as const;
const docOrders = (orders: readonly { column: string; ascending?: boolean }[]) =>
  orders.map((order) => ({ ...order }));

export async function listCompanies(): Promise<Company[]> {
  return listTable("companies", MASTER_SELECTS.companies, docOrders(byName));
}
export async function getCompany(id: string): Promise<Company | null> {
  return getTable("companies", MASTER_SELECTS.companies, id);
}

export async function listBranches(): Promise<Branch[]> {
  return listTable("branches", MASTER_SELECTS.branches, docOrders(byName));
}

export async function listCustomers(): Promise<Customer[]> {
  return listTable("customers", MASTER_SELECTS.customers, docOrders(byName));
}
export async function getCustomer(id: string): Promise<Customer | null> {
  return getTable("customers", MASTER_SELECTS.customers, id);
}

export async function listSuppliers(): Promise<Supplier[]> {
  return listTable("suppliers", MASTER_SELECTS.suppliers, docOrders(byName));
}
export async function getSupplier(id: string): Promise<Supplier | null> {
  return getTable("suppliers", MASTER_SELECTS.suppliers, id);
}

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
  return candidates[0]?.rate ?? 1;
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
