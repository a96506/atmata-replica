import { z } from "zod";

import { actionSchema } from "../validation";

export const localeSchema = z.enum(["en", "ar"]);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .uuid("Idempotency key must be a UUID");

export const expectedRowVersionSchema = z
  .number()
  .int()
  .positive("expectedRowVersion must be a positive integer");

export const docTypeSchema = z.enum([
  "pr",
  "rfq",
  "po",
  "grn",
  "vendor_bill",
  "vendor_payment",
  "vendor_return",
  "debit_note",
  "quote",
  "so",
  "dn",
  "customer_invoice",
  "customer_receipt",
  "customer_return",
  "credit_note",
  "journal_entry",
  "stock_adjustment",
  "internal_transfer",
]);

export const transitionActionSchema = z.enum([
  "submit",
  "approve",
  "reject",
  "recall",
  "post",
  "cancel",
  "reverse",
  "send",
  "record_quotes",
  "award",
  "close",
]);

/** Shared fields every document write command must carry. */
export const writeCommandBaseSchema = actionSchema({
  locale: localeSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const transitionDocumentSchema = actionSchema({
  locale: localeSchema,
  docType: docTypeSchema,
  docId: z.string().trim().min(1),
  action: transitionActionSchema,
  expectedRowVersion: expectedRowVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export const postDocumentSchema = actionSchema({
  locale: localeSchema,
  docType: docTypeSchema,
  docId: z.string().trim().min(1),
  expectedRowVersion: expectedRowVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const reverseDocumentSchema = actionSchema({
  locale: localeSchema,
  docType: docTypeSchema,
  docId: z.string().trim().min(1),
  expectedRowVersion: expectedRowVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export type TransitionDocumentInput = z.infer<typeof transitionDocumentSchema>;
export type PostDocumentInput = z.infer<typeof postDocumentSchema>;
export type ReverseDocumentInput = z.infer<typeof reverseDocumentSchema>;
export type TransitionAction = z.infer<typeof transitionActionSchema>;
