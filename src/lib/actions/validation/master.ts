import { z } from "zod";

import { actionSchema } from "../validation";
import { localeSchema } from "./common";

const currencySchema = z.enum(["KWD", "SAR", "AED", "USD"]);
const taxJurisdictionSchema = z.enum(["KW", "SA", "AE"]);
const costingMethodSchema = z.enum(["FIFO", "AVG", "STD"]);
const creditScoreSchema = z.enum(["A", "B", "C", "D"]);
const paymentStatusSchema = z.enum(["current", "overdue_14", "on_hold"]);

const roleSchema = z.enum([
  "admin",
  "approver",
  "ap_clerk",
  "ar_clerk",
  "warehouse",
  "buyer",
  "sales_rep",
  "accountant",
  "period_adjust",
  "audit_unlock",
  "viewer",
  "ai_agent",
]);

const base = actionSchema({
  locale: localeSchema,
});

const idSchema = z.string().trim().min(1);

// Products
export const createProductSchema = base.extend({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  uom: z.string().trim().min(1).max(20),
  taxCodeId: idSchema,
  costingMethod: costingMethodSchema,
  lotTracked: z.boolean().default(false),
  purchasable: z.boolean().default(true),
  sellable: z.boolean().default(true),
  defaultPurchasePrice: z.number().min(0).default(0),
  defaultSalePrice: z.number().min(0).default(0),
  reorderPoint: z.number().min(0).default(0),
});

export const updateProductSchema = createProductSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteProductSchema = base.extend({ id: idSchema });

// Warehouses
export const createWarehouseSchema = base.extend({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
});

export const updateWarehouseSchema = createWarehouseSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteWarehouseSchema = base.extend({ id: idSchema });

// Locations (bin / zone within a warehouse)
export const createLocationSchema = base.extend({
  warehouseId: idSchema,
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteLocationSchema = base.extend({ id: idSchema });

// Suppliers
export const createSupplierSchema = base.extend({
  name: z.string().trim().min(1).max(200),
  vatNumber: z.string().trim().max(50).optional(),
  bankAccount: z.string().trim().max(50).optional(),
  paymentTermId: idSchema,
  whtApplicable: z.boolean().default(false),
  whtRate: z.number().min(0).max(1).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteSupplierSchema = base.extend({ id: idSchema });

// Customers
export const createCustomerSchema = base.extend({
  name: z.string().trim().min(1).max(200),
  vatNumber: z.string().trim().max(50).optional(),
  creditLimit: z.number().min(0).default(0),
  creditScore: creditScoreSchema.default("C"),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteCustomerSchema = base.extend({ id: idSchema });

// Bank accounts
export const createBankAccountSchema = base.extend({
  name: z.string().trim().min(1).max(120),
  iban: z.string().trim().min(1).max(50),
  currency: currencySchema,
  accountId: idSchema.optional(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteBankAccountSchema = base.extend({ id: idSchema });

// Approval rules
export const createApprovalRuleSchema = base.extend({
  docType: z.string().trim().min(1).max(40),
  minAmount: z.number().min(0).default(0),
  maxAmount: z.number().min(0).nullable().optional(),
  approverRoles: z.array(roleSchema).min(1),
  sequence: z.number().int().min(1).default(1),
  active: z.boolean().default(true),
});

export const updateApprovalRuleSchema = createApprovalRuleSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteApprovalRuleSchema = base.extend({ id: idSchema });

// Tax codes
export const createTaxCodeSchema = base.extend({
  jurisdiction: taxJurisdictionSchema,
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  rate: z.number().min(0).max(1),
  isInput: z.boolean().default(false),
  isOutput: z.boolean().default(false),
});

export const updateTaxCodeSchema = createTaxCodeSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteTaxCodeSchema = base.extend({ id: idSchema });

// FX rates
export const createFxRateSchema = base
  .extend({
    baseCurrency: currencySchema,
    quoteCurrency: currencySchema,
    rate: z.number().positive(),
    rateDate: z.string().trim().min(1),
    source: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.baseCurrency !== d.quoteCurrency, {
    message: "Base and quote currencies must differ",
    path: ["quoteCurrency"],
  });

export const updateFxRateSchema = base
  .extend({
    id: idSchema,
    baseCurrency: currencySchema.optional(),
    quoteCurrency: currencySchema.optional(),
    rate: z.number().positive().optional(),
    rateDate: z.string().trim().min(1).optional(),
    source: z.string().trim().max(80).optional(),
  })
  .refine(
    (d) =>
      d.baseCurrency == null ||
      d.quoteCurrency == null ||
      d.baseCurrency !== d.quoteCurrency,
    {
      message: "Base and quote currencies must differ",
      path: ["quoteCurrency"],
    },
  );

export const deleteFxRateSchema = base.extend({ id: idSchema });

// Currencies
export const createCurrencySchema = base.extend({
  code: currencySchema,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(16),
  decimalPlaces: z.number().int().min(0).max(6),
  active: z.boolean().default(true),
});

export const updateCurrencySchema = createCurrencySchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteCurrencySchema = base.extend({ id: idSchema });


// Chart of accounts
const accountTypeSchema = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

const optionalParentSchema = z
  .union([idSchema, z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const createAccountSchema = base.extend({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  type: accountTypeSchema,
  parent: optionalParentSchema,
  active: z.boolean().default(true),
});

export const updateAccountSchema = createAccountSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deleteAccountSchema = base.extend({ id: idSchema });

// Price lists
export const createPriceListSchema = base.extend({
  name: z.string().trim().min(1).max(120),
  currency: currencySchema,
  active: z.boolean().default(true),
  startsOn: z.string().trim().min(1).optional(),
  endsOn: z.string().trim().min(1).optional(),
});

export const updatePriceListSchema = createPriceListSchema.partial().extend({
  id: idSchema,
  locale: localeSchema,
});

export const deletePriceListSchema = base.extend({ id: idSchema });

// Price list items (lines on a price list)
export const createPriceListItemSchema = base.extend({
  priceListId: idSchema,
  productId: idSchema,
  unitPrice: z.number().min(0),
  minQty: z.number().positive().default(1),
});

export const updatePriceListItemSchema = createPriceListItemSchema
  .partial()
  .extend({
    id: idSchema,
    locale: localeSchema,
  });

export const deletePriceListItemSchema = base.extend({ id: idSchema });

export const resolvePriceListItemSchema = z.object({
  priceListId: idSchema,
  productId: idSchema,
  qty: z.number().positive(),
  onDate: z.string().trim().min(1).optional(),
});

// Company profile (tenant self-update; only the updatable columns)
export const updateCompanyProfileSchema = base.extend({
  name: z.string().trim().min(1).max(120).optional(),
  taxProfile: taxJurisdictionSchema.optional(),
  baseCurrency: currencySchema.optional(),
  vatNumber: z.string().trim().max(50).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type CreateApprovalRuleInput = z.infer<typeof createApprovalRuleSchema>;
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleSchema>;
export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;
export type CreateFxRateInput = z.infer<typeof createFxRateSchema>;
export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>;
export type CreatePriceListItemInput = z.infer<typeof createPriceListItemSchema>;
export type UpdatePriceListItemInput = z.infer<typeof updatePriceListItemSchema>;
export type ResolvePriceListItemInput = z.infer<
  typeof resolvePriceListItemSchema
>;
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
