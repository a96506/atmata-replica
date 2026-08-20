import { z } from "zod";

import { actionSchema } from "../validation";
import { writeCommandBaseSchema } from "./common";
import {
  currencyCodeSchema,
  isoDateSchema,
  writeIntentSchema,
  writeSourceSchema,
} from "./p2p";

export const journalEntryLineSchema = actionSchema({
  accountId: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
}).refine(
  (line) =>
    (line.debit > 0 && line.credit === 0) ||
    (line.credit > 0 && line.debit === 0),
  {
    message: "each line must have exactly one of debit or credit greater than zero",
  },
);

export const createJournalEntrySchema = writeCommandBaseSchema
  .extend({
    intent: writeIntentSchema,
    header: actionSchema({
      date: isoDateSchema,
      currency: currencyCodeSchema.optional(),
      notes: z.string().trim().max(4000).optional(),
      reference: z.string().trim().max(500).optional(),
    }),
    lines: z.array(journalEntryLineSchema).min(2),
    source: writeSourceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const debit = value.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = value.lines.reduce((sum, line) => sum + line.credit, 0);
    if (debit !== credit || debit === 0) {
      ctx.addIssue({
        code: "custom",
        message: "journal entry must be balanced with non-zero totals",
        path: ["lines"],
      });
    }
  });

export type JournalEntryLine = z.infer<typeof journalEntryLineSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
