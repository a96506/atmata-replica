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

export const COMPANIES: Company[] = [
  {
    id: "co_1",
    name: "Atmata Trading Co.",
    taxProfile: "KW",
    baseCurrency: "KWD",
    vatNumber: "KW100100100",
  },
  {
    id: "co_2",
    name: "Atmata Saudi",
    taxProfile: "SA",
    baseCurrency: "SAR",
    vatNumber: "SA310000000003",
  },
  {
    id: "co_3",
    name: "Atmata Emirates",
    taxProfile: "AE",
    baseCurrency: "AED",
    vatNumber: "AE100000000003",
  },
];

export const BRANCHES: Branch[] = [
  { id: "br_1", companyId: "co_1", name: "Kuwait HQ" },
  { id: "br_2", companyId: "co_2", name: "Riyadh Branch" },
  { id: "br_3", companyId: "co_3", name: "Dubai Branch" },
];

export const TAX_CODES: TaxCode[] = [
  {
    id: "tax_kw_vat_5",
    jurisdiction: "KW",
    code: "KW-VAT-5",
    nameEn: "Kuwait VAT 5%",
    nameAr: "ضريبة القيمة المضافة الكويت 5٪",
    rate: 0.05,
    isInput: true,
    isOutput: true,
  },
  {
    id: "tax_sa_vat_15",
    jurisdiction: "SA",
    code: "SA-VAT-15",
    nameEn: "Saudi VAT 15%",
    nameAr: "ضريبة القيمة المضافة السعودية 15٪",
    rate: 0.15,
    isInput: true,
    isOutput: true,
  },
  {
    id: "tax_ae_vat_5",
    jurisdiction: "AE",
    code: "AE-VAT-5",
    nameEn: "UAE VAT 5%",
    nameAr: "ضريبة القيمة المضافة الإمارات 5٪",
    rate: 0.05,
    isInput: true,
    isOutput: true,
  },
  {
    id: "tax_exempt",
    jurisdiction: "KW",
    code: "EXEMPT",
    nameEn: "Tax exempt",
    nameAr: "معفى من الضريبة",
    rate: 0,
    isInput: false,
    isOutput: false,
  },
];

export const PAYMENT_TERMS: PaymentTerm[] = [
  { id: "pt_net30", code: "NET30", nameEn: "Net 30", nameAr: "صافي 30 يوم", netDays: 30 },
  { id: "pt_net60", code: "NET60", nameEn: "Net 60", nameAr: "صافي 60 يوم", netDays: 60 },
  { id: "pt_cod", code: "COD", nameEn: "Cash on delivery", nameAr: "الدفع عند الاستلام", netDays: 0 },
];

export const WAREHOUSES: Warehouse[] = [
  { id: "wh_1", companyId: "co_1", code: "MAIN", name: "Main DC — Shuwaikh" },
  { id: "wh_2", companyId: "co_1", code: "SHOWROOM", name: "Showroom — Salmiya" },
];

export const LOCATIONS: Location[] = [
  { id: "loc_1", warehouseId: "wh_1", code: "A-01", name: "Aisle A — Rack 01" },
  { id: "loc_2", warehouseId: "wh_1", code: "B-03", name: "Aisle B — Rack 03" },
  { id: "loc_3", warehouseId: "wh_2", code: "FLOOR", name: "Showroom floor" },
];

export const BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "bank_1",
    companyId: "co_1",
    name: "NBK Current — KWD",
    iban: "KW81NBOK0000000000001234560101",
    currency: "KWD",
  },
];

export const CUSTOMERS: Customer[] = [
  {
    id: "cust_1",
    name: "Kuwait Retail Co.",
    vatNumber: "KW200200200",
    creditLimit: 25_000,
    exposure: 18_420,
    paymentStatus: "current",
    creditScore: "A",
  },
  {
    id: "cust_2",
    name: "Gulf Foods WLL",
    vatNumber: "KW200300300",
    creditLimit: 40_000,
    exposure: 38_900,
    paymentStatus: "overdue_14",
    creditScore: "B",
  },
  {
    id: "cust_3",
    name: "City Pharmacy",
    vatNumber: "KW200400400",
    creditLimit: 15_000,
    exposure: 14_200,
    paymentStatus: "current",
    creditScore: "A",
  },
  {
    id: "cust_4",
    name: "Project Alpha JV",
    vatNumber: "KW200500500",
    creditLimit: 60_000,
    exposure: 62_500,
    paymentStatus: "on_hold",
    creditScore: "C",
  },
];

export const SUPPLIERS: Supplier[] = [
  {
    id: "sup_1",
    name: "PetroChem Gulf",
    vatNumber: "KW300100100",
    bankAccount: "KW81NBOK0000000000999100",
    paymentTermId: "pt_net30",
  },
  {
    id: "sup_2",
    name: "PackLine KW",
    vatNumber: "KW300200200",
    bankAccount: "KW81NBOK0000000000999200",
    paymentTermId: "pt_net30",
  },
  {
    id: "sup_3",
    name: "PrintHub",
    vatNumber: "KW300300300",
    bankAccount: "KW81NBOK0000000000999300",
    paymentTermId: "pt_net60",
    whtApplicable: true,
    whtRate: 0.05,
  },
  {
    id: "sup_4",
    name: "Gulf Supplies WLL",
    vatNumber: "KW300400400",
    bankAccount: "KW81NBOK0000000000999400",
    paymentTermId: "pt_net30",
  },
];

export const PRODUCTS: Product[] = [
  {
    id: "prod_1",
    sku: "RM-01",
    name: "Resin 25kg",
    uom: "BAG",
    taxCodeId: "tax_kw_vat_5",
    costingMethod: "AVG",
    lotTracked: false,
    purchasable: true,
    sellable: false,
    defaultPurchasePrice: 12.4,
    defaultSalePrice: 0,
  },
  {
    id: "prod_2",
    sku: "PKG-L",
    name: "Carton large",
    uom: "PCS",
    taxCodeId: "tax_kw_vat_5",
    costingMethod: "AVG",
    lotTracked: false,
    purchasable: true,
    sellable: false,
    defaultPurchasePrice: 0.35,
    defaultSalePrice: 0,
  },
  {
    id: "prod_3",
    sku: "LBL-T",
    name: "Thermal label roll",
    uom: "ROLL",
    taxCodeId: "tax_kw_vat_5",
    costingMethod: "AVG",
    lotTracked: false,
    purchasable: true,
    sellable: false,
    defaultPurchasePrice: 8.75,
    defaultSalePrice: 0,
  },
  {
    id: "prod_4",
    sku: "SKU-104",
    name: "Display cooler — 2 door",
    uom: "PCS",
    taxCodeId: "tax_kw_vat_5",
    costingMethod: "AVG",
    lotTracked: true,
    purchasable: true,
    sellable: true,
    defaultPurchasePrice: 620,
    defaultSalePrice: 890,
  },
  {
    id: "prod_5",
    sku: "SKU-220",
    name: "Barcode scanner kit",
    uom: "PCS",
    taxCodeId: "tax_kw_vat_5",
    costingMethod: "AVG",
    lotTracked: false,
    purchasable: true,
    sellable: true,
    defaultPurchasePrice: 28,
    defaultSalePrice: 42.5,
  },
];

/** Fiscal calendar 2026 for co_1 — Jan/Feb hard-closed, Mar soft-closed, Apr+ open. */
export const FISCAL_PERIODS: FiscalPeriod[] = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  const status: FiscalPeriod["status"] =
    month <= 2 ? "hard_closed" : month === 3 ? "soft_closed" : "open";
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
  return {
    id: `fp_2026_${mm}`,
    companyId: "co_1",
    year: 2026,
    month,
    start: `2026-${mm}-01`,
    end: `2026-${mm}-${String(lastDay).padStart(2, "0")}`,
    status,
  };
});
