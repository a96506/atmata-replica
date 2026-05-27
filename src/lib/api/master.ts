import {
  BANK_ACCOUNTS,
  BRANCHES,
  COMPANIES,
  CUSTOMERS,
  FISCAL_PERIODS,
  LOCATIONS,
  PAYMENT_TERMS,
  PRODUCTS,
  SUPPLIERS,
  TAX_CODES,
  WAREHOUSES,
} from "@/mocks/seed/master";
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

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listCompanies(): Promise<Company[]> {
  return COMPANIES;
}
export async function getCompany(id: string): Promise<Company | null> {
  return byId(COMPANIES, id);
}

export async function listBranches(): Promise<Branch[]> {
  return BRANCHES;
}

export async function listCustomers(): Promise<Customer[]> {
  return CUSTOMERS;
}
export async function getCustomer(id: string): Promise<Customer | null> {
  return byId(CUSTOMERS, id);
}

export async function listSuppliers(): Promise<Supplier[]> {
  return SUPPLIERS;
}
export async function getSupplier(id: string): Promise<Supplier | null> {
  return byId(SUPPLIERS, id);
}

export async function listProducts(): Promise<Product[]> {
  return PRODUCTS;
}
export async function getProduct(id: string): Promise<Product | null> {
  return byId(PRODUCTS, id);
}

export async function listWarehouses(): Promise<Warehouse[]> {
  return WAREHOUSES;
}
export async function getWarehouse(id: string): Promise<Warehouse | null> {
  return byId(WAREHOUSES, id);
}

export async function listLocations(): Promise<Location[]> {
  return LOCATIONS;
}

export async function listTaxCodes(): Promise<TaxCode[]> {
  return TAX_CODES;
}
export async function getTaxCode(id: string): Promise<TaxCode | null> {
  return byId(TAX_CODES, id);
}

export async function listPaymentTerms(): Promise<PaymentTerm[]> {
  return PAYMENT_TERMS;
}
export async function getPaymentTerm(id: string): Promise<PaymentTerm | null> {
  return byId(PAYMENT_TERMS, id);
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  return BANK_ACCOUNTS;
}
export async function getBankAccount(id: string): Promise<BankAccount | null> {
  return byId(BANK_ACCOUNTS, id);
}

export async function listFiscalPeriods(): Promise<FiscalPeriod[]> {
  return FISCAL_PERIODS;
}
