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
