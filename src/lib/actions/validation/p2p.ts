import { z } from "zod";

import { actionSchema } from "../validation";
import {
  docTypeSchema,
  expectedRowVersionSchema,
  idempotencyKeySchema,
  localeSchema,
  writeCommandBaseSchema,
} from "./common";

export const writeIntentSchema = z.enum(["save_draft", "submit", "post"]);

export const currencyCodeSchema = z.enum(["KWD", "SAR", "AED", "USD"]);

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const productLineSchema = actionSchema({
  productId: z.string().trim().min(1),
  description: z.string().trim().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxCodeId: z.string().trim().min(1).optional(),
  discount: z.number().nonnegative().optional(),
  sourceLineId: z.string().trim().min(1).optional(),
});

export const writeSourceParentSchema = actionSchema({
  docType: docTypeSchema,
  docId: z.string().trim().min(1),
});

export const writeSourceSchema = actionSchema({
  parents: z.array(writeSourceParentSchema).min(1).optional(),
  allocations: z
    .array(
      actionSchema({
        billId: z.string().trim().min(1).optional(),
        invoiceId: z.string().trim().min(1).optional(),
        amount: z.number().positive(),
      }),
    )
    .optional(),
});

export const vendorReturnReasonSchema = z.enum([
  "damaged",
  "wrong_item",
  "quality_fail",
  "expired",
  "other",
]);

export const paymentMethodSchema = z.enum(["wire", "cheque", "cash"]);

/** Doc types allowed by `update_document_header` capability matrix. */
export const editableDocTypeSchema = z.enum([
  "pr",
  "rfq",
  "po",
  "grn",
  "vendor_bill",
  "vendor_payment",
  "vendor_return",
  "quote",
  "so",
  "dn",
  "customer_invoice",
  "customer_receipt",
  "customer_return",
  "journal_entry",
  "stock_adjustment",
  "internal_transfer",
]);

export const createPurchaseRequisitionSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    neededBy: isoDateSchema,
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z.array(productLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createPurchaseOrderSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    supplierId: z.string().trim().min(1),
    currency: currencyCodeSchema,
    paymentTermId: z.string().trim().min(1),
    warehouseId: z.string().trim().min(1),
    date: isoDateSchema,
    expectedDate: isoDateSchema,
    notes: z.string().trim().max(4000).optional(),
    prId: z.string().trim().min(1).optional(),
  }),
  lines: z.array(productLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createGoodsReceiptSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    poId: z.string().trim().min(1),
    warehouseId: z.string().trim().min(1).optional(),
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z
    .array(
      actionSchema({
        poLineId: z.string().trim().min(1),
        qtyReceived: z.number().positive(),
        description: z.string().trim().min(1).optional(),
        lotNumber: z.string().trim().min(1).optional(),
        unitPrice: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export const vendorBillLineSchema = actionSchema({
  productId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxCodeId: z.string().trim().min(1).optional(),
  discount: z.number().nonnegative().optional(),
  poLineId: z.string().trim().min(1).optional(),
  grnLineId: z.string().trim().min(1).optional(),
});

export const createVendorBillSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    supplierId: z.string().trim().min(1),
    invoiceNumber: z.string().trim().min(1),
    date: isoDateSchema,
    dueDate: isoDateSchema,
    currency: currencyCodeSchema,
    poId: z.string().trim().min(1).optional(),
    grnId: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z.array(vendorBillLineSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const paymentAllocationSchema = actionSchema({
  billId: z.string().trim().min(1),
  amount: z.number().positive(),
});

export const createVendorPaymentSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    supplierId: z.string().trim().min(1),
    bankAccountId: z.string().trim().min(1),
    date: isoDateSchema,
    currency: currencyCodeSchema,
    amount: z.number().positive(),
    method: paymentMethodSchema,
  }),
  lines: z.array(paymentAllocationSchema).min(1),
  source: writeSourceSchema.optional(),
});

export const createRfqSchema = writeCommandBaseSchema
  .extend({
    intent: writeIntentSchema,
    header: actionSchema({
      expectedQuoteBy: isoDateSchema,
      date: isoDateSchema.optional(),
      notes: z.string().trim().max(4000).optional(),
      invitedSupplierIds: z.array(z.string().trim().min(1)),
    }),
    lines: z.array(productLineSchema).default([]),
    source: writeSourceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasLines = value.lines.length > 0;
    const hasParents = (value.source?.parents?.length ?? 0) > 0;
    if (!hasLines && !hasParents) {
      ctx.addIssue({
        code: "custom",
        message: "lines required unless source.parents is provided",
        path: ["lines"],
      });
    }
  });

export const createVendorReturnSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    grnId: z.string().trim().min(1),
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z
    .array(
      actionSchema({
        grnLineId: z.string().trim().min(1),
        qty: z.number().positive(),
        reasonCode: vendorReturnReasonSchema,
        notes: z.string().trim().max(2000).optional(),
        lotNumber: z.string().trim().min(1).optional(),
      }),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export const updateDocumentHeaderSchema = actionSchema({
  locale: localeSchema,
  docType: editableDocTypeSchema,
  docId: z.string().trim().min(1),
  expectedRowVersion: expectedRowVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  patch: actionSchema({
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }).refine((patch) => patch.date !== undefined || patch.notes !== undefined, {
    message: "patch must include date and/or notes",
  }),
});

export const awardRfqSchema = actionSchema({
  locale: localeSchema,
  rfqId: z.string().trim().min(1),
  quoteId: z.string().trim().min(1),
  expectedRowVersion: expectedRowVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type WriteIntent = z.infer<typeof writeIntentSchema>;
export type ProductLine = z.infer<typeof productLineSchema>;
export type CreatePurchaseRequisitionInput = z.infer<
  typeof createPurchaseRequisitionSchema
>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type CreateVendorBillInput = z.infer<typeof createVendorBillSchema>;
export type CreateVendorPaymentInput = z.infer<typeof createVendorPaymentSchema>;
export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type CreateVendorReturnInput = z.infer<typeof createVendorReturnSchema>;
export type UpdateDocumentHeaderInput = z.infer<typeof updateDocumentHeaderSchema>;
export type AwardRfqInput = z.infer<typeof awardRfqSchema>;
