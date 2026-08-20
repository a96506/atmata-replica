import { z } from "zod";

import { actionSchema } from "../validation";
import {
  idempotencyKeySchema,
  localeSchema,
  writeCommandBaseSchema,
} from "./common";
import { isoDateSchema } from "./p2p";

const attachmentSchema = actionSchema({
  key: z.string().trim().min(1),
  url: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(500).optional(),
  mime: z.string().trim().min(1).max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});

const bankStatementLineSchema = actionSchema({
  lineNumber: z.number().int().positive(),
  date: isoDateSchema,
  description: z.string().trim().max(2000).optional(),
  reference: z.string().trim().max(500).optional().nullable(),
  amount: z.number().refine((n) => n !== 0, "amount must be non-zero"),
  runningBalance: z.number().optional().nullable(),
});

export const importBankStatementSchema = writeCommandBaseSchema.extend({
  header: actionSchema({
    bankAccountId: z.string().trim().min(1),
    number: z.string().trim().min(1).max(100),
    periodStart: isoDateSchema.optional(),
    periodEnd: isoDateSchema.optional(),
    openingBalance: z.number().optional(),
    closingBalance: z.number().optional(),
  }),
  lines: z.array(bankStatementLineSchema).min(1),
  attachment: attachmentSchema.optional(),
});

export const upsertReconciliationRuleSchema = writeCommandBaseSchema.extend({
  rule: actionSchema({
    id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    priority: z.number().int().nonnegative().optional(),
    matchType: z.enum(["reference", "amount", "description", "compound"]),
    conditions: z.record(z.string(), z.unknown()).optional(),
    action: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional(),
  }),
});

export const deleteReconciliationRuleSchema = writeCommandBaseSchema.extend({
  ruleId: z.string().trim().min(1),
});

export const skipBankStatementLineSchema = writeCommandBaseSchema.extend({
  lineId: z.string().trim().min(1),
});

export const manualReconciliationMatchSchema = writeCommandBaseSchema
  .extend({
    lineId: z.string().trim().min(1),
    journalEntryId: z.string().trim().min(1).optional(),
    sourceDocType: z.string().trim().min(1).optional(),
    sourceDocId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasJe = Boolean(value.journalEntryId);
    const hasSrc =
      Boolean(value.sourceDocType) && Boolean(value.sourceDocId);
    if (!hasJe && !hasSrc) {
      ctx.addIssue({
        code: "custom",
        message: "journal entry or source document required",
        path: ["journalEntryId"],
      });
    }
    if (
      Boolean(value.sourceDocType) !== Boolean(value.sourceDocId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "sourceDocType and sourceDocId must be supplied together",
        path: ["sourceDocType"],
      });
    }
  });

export const acceptReconciliationMatchSchema = actionSchema({
  locale: localeSchema,
  idempotencyKey: idempotencyKeySchema,
  matchId: z.string().trim().min(1),
});

export const rejectReconciliationMatchSchema = writeCommandBaseSchema.extend({
  matchId: z.string().trim().min(1),
});

export const completeReconciliationSessionSchema = writeCommandBaseSchema.extend(
  {
    statementId: z.string().trim().min(1),
  },
);

export type ImportBankStatementInput = z.infer<
  typeof importBankStatementSchema
>;
export type UpsertReconciliationRuleInput = z.infer<
  typeof upsertReconciliationRuleSchema
>;
export type DeleteReconciliationRuleInput = z.infer<
  typeof deleteReconciliationRuleSchema
>;
export type SkipBankStatementLineInput = z.infer<
  typeof skipBankStatementLineSchema
>;
export type ManualReconciliationMatchInput = z.infer<
  typeof manualReconciliationMatchSchema
>;
export type AcceptReconciliationMatchInput = z.infer<
  typeof acceptReconciliationMatchSchema
>;
export type RejectReconciliationMatchInput = z.infer<
  typeof rejectReconciliationMatchSchema
>;
export type CompleteReconciliationSessionInput = z.infer<
  typeof completeReconciliationSessionSchema
>;
