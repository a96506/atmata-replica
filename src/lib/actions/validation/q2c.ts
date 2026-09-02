import { z } from "zod";

import { actionSchema } from "../validation";
import { idempotencyKeySchema, localeSchema, writeCommandBaseSchema } from "./common";
import {
  currencyCodeSchema,
  isoDateSchema,
  productLineSchema,
  writeIntentSchema,
  writeSourceSchema,
} from "./p2p";

export const customerReturnReasonSchema = z.enum([
  "damaged",
  "wrong_item",
  "not_as_described",
  "customer_dissatisfied",
  "expired",
  "other",
]);

export const receiptMethodSchema = z.enum(["wire", "cheque", "cash", "card"]);

export const createQuoteSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    customerId: z.string().trim().min(1),
    currency: currencyCodeSchema,
    date: isoDateSchema.optional(),
    validUntil: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
    opportunityId: z.string().trim().min(1).optional(),
    paymentTermId: z.string().trim().min(1).optional(),
  }),
  lines: z.array(productLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createSalesOrderSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    customerId: z.string().trim().min(1),
    currency: currencyCodeSchema,
    paymentTermId: z.string().trim().min(1).optional(),
    warehouseId: z.string().trim().min(1),
    date: isoDateSchema,
    promisedDate: isoDateSchema.optional(),
    expectedDeliveryDate: isoDateSchema.optional(),
    quoteId: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(4000).optional(),
  }).refine(
    (header) =>
      header.promisedDate !== undefined ||
      header.expectedDeliveryDate !== undefined,
    { message: "promisedDate or expectedDeliveryDate is required" },
  ),
  lines: z.array(productLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createDeliveryNoteSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    soId: z.string().trim().min(1),
    warehouseId: z.string().trim().min(1).optional(),
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z
    .array(
      actionSchema({
        soLineId: z.string().trim().min(1),
        qtyDelivered: z.number().positive().optional(),
        qty: z.number().positive().optional(),
        description: z.string().trim().min(1).optional(),
        unitPrice: z.number().nonnegative().optional(),
        taxCodeId: z.string().trim().min(1).optional(),
        discount: z.number().nonnegative().optional(),
        lotNumber: z.string().trim().min(1).optional(),
      }).refine(
        (line) => line.qtyDelivered !== undefined || line.qty !== undefined,
        { message: "qtyDelivered or qty is required" },
      ),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export const customerInvoiceLineSchema = actionSchema({
  productId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxCodeId: z.string().trim().min(1).optional(),
  discount: z.number().nonnegative().optional(),
  soLineId: z.string().trim().min(1).optional(),
  dnLineId: z.string().trim().min(1).optional(),
});

export const createCustomerInvoiceSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    customerId: z.string().trim().min(1),
    date: isoDateSchema,
    dueDate: isoDateSchema,
    currency: currencyCodeSchema,
    soId: z.string().trim().min(1).optional(),
    dnId: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z.array(customerInvoiceLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const receiptAllocationSchema = actionSchema({
  invoiceId: z.string().trim().min(1),
  amount: z.number().positive(),
});

export const createCustomerReceiptSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    customerId: z.string().trim().min(1),
    bankAccountId: z.string().trim().min(1),
    date: isoDateSchema,
    currency: currencyCodeSchema,
    amount: z.number().positive(),
    method: receiptMethodSchema,
  }),
  lines: z.array(receiptAllocationSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createCustomerReturnSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    dnId: z.string().trim().min(1),
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z
    .array(
      actionSchema({
        dnLineId: z.string().trim().min(1),
        qty: z.number().positive(),
        reasonCode: customerReturnReasonSchema,
        notes: z.string().trim().max(2000).optional(),
        lotNumber: z.string().trim().min(1).optional(),
      }),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type CreateDeliveryNoteInput = z.infer<typeof createDeliveryNoteSchema>;
export type CreateCustomerInvoiceInput = z.infer<
  typeof createCustomerInvoiceSchema
>;
export type CreateCustomerReceiptInput = z.infer<
  typeof createCustomerReceiptSchema
>;

export const opportunityStageSchema = z.enum([
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export const createOpportunitySchema = actionSchema({
  locale: localeSchema,
  title: z.string().trim().min(1).max(200),
  customerId: z.string().trim().min(1),
  stage: opportunityStageSchema,
  value: z.number().min(0),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

const opportunityIdSchema = z.string().trim().min(1);

export const updateOpportunitySchema = actionSchema({
  locale: localeSchema,
  id: opportunityIdSchema,
  stage: opportunityStageSchema.optional(),
  value: z.number().min(0).optional(),
}).refine((data) => data.stage !== undefined || data.value !== undefined, {
  message: "At least one of stage or value is required",
});

export const deleteOpportunitySchema = actionSchema({
  locale: localeSchema,
  id: opportunityIdSchema,
});

export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type DeleteOpportunityInput = z.infer<typeof deleteOpportunitySchema>;
export type CreateCustomerReturnInput = z.infer<
  typeof createCustomerReturnSchema
>;


export const applyCreditToInvoiceSchema = actionSchema({
  locale: localeSchema,
  invoiceId: z.string().trim().min(1),
  creditNoteId: z.string().trim().min(1),
  amount: z.number().positive(),
  idempotencyKey: idempotencyKeySchema,
  /** When true, RPC posts a balanced contra-AR journal (default off). */
  postGl: z.boolean().optional().default(false),
});

export type ApplyCreditToInvoiceInput = z.infer<typeof applyCreditToInvoiceSchema>;
