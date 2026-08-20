import type { Currency, TaxJurisdiction } from "../common";

export type Company = {
  id: string;
  rowVersion: number;
  name: string;
  taxProfile: TaxJurisdiction;
  baseCurrency: Currency;
  vatNumber: string;
};

export type Branch = {
  id: string;
  companyId: string;
  name: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  vatNumber?: string | null;
  creditLimit: number;
  exposure: number;
  paymentStatus: "current" | "overdue_14" | "on_hold";
  creditScore: "A" | "B" | "C" | "D";
};

export type Supplier = {
  id: string;
  name: string;
  email: string;
  vatNumber?: string | null;
  bankAccount?: string | null;
  paymentTermId: string;
  /** Whether vendor payments to this supplier withhold tax. */
  whtApplicable?: boolean;
  /** Withholding rate (e.g. 0.05 for 5%). Defaults to 0.05 when whtApplicable=true and unset. */
  whtRate?: number | null;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  taxCodeId: string;
  costingMethod: "FIFO" | "AVG" | "STD";
  lotTracked: boolean;
  purchasable: boolean;
  sellable: boolean;
  defaultPurchasePrice: number;
  defaultSalePrice: number;
};

export type Warehouse = {
  id: string;
  companyId: string;
  code: string;
  name: string;
};

export type Location = {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
};

export type TaxCode = {
  id: string;
  jurisdiction: TaxJurisdiction;
  code: string;
  nameEn: string;
  nameAr: string;
  rate: number;
  isInput: boolean;
  isOutput: boolean;
};

export type PaymentTerm = {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  netDays: number;
};

export type BankAccount = {
  id: string;
  companyId: string;
  name: string;
  iban: string;
  currency: Currency;
};

export type FiscalPeriod = {
  id: string;
  companyId: string;
  year: number;
  month: number;
  start: string;
  end: string;
  status: "open" | "soft_closed" | "hard_closed";
};
