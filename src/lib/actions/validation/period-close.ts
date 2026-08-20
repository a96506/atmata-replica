import { z } from "zod";

import { writeCommandBaseSchema } from "./common";

export const startPeriodCloseSchema = writeCommandBaseSchema.extend({
  fiscalPeriodId: z.string().trim().min(1),
});

export const rescanPeriodCloseSchema = writeCommandBaseSchema.extend({
  fiscalPeriodId: z.string().trim().min(1),
});

export const completePeriodCloseTaskSchema = writeCommandBaseSchema.extend({
  taskId: z.string().trim().min(1),
  status: z.enum(["completed", "skipped"]).default("completed"),
});

export const setFiscalPeriodStatusSchema = writeCommandBaseSchema.extend({
  fiscalPeriodId: z.string().trim().min(1),
  status: z.enum(["open", "soft_closed", "hard_closed"]),
});

export const closeFiscalYearSchema = writeCommandBaseSchema.extend({
  year: z.number().int().min(2000).max(2200),
});

export const markInboxNotificationReadSchema = writeCommandBaseSchema.extend({
  notificationId: z.string().trim().min(1),
});

export type StartPeriodCloseInput = z.infer<typeof startPeriodCloseSchema>;
export type RescanPeriodCloseInput = z.infer<typeof rescanPeriodCloseSchema>;
export type CompletePeriodCloseTaskInput = z.infer<
  typeof completePeriodCloseTaskSchema
>;
export type SetFiscalPeriodStatusInput = z.infer<
  typeof setFiscalPeriodStatusSchema
>;
export type CloseFiscalYearInput = z.infer<typeof closeFiscalYearSchema>;
export type MarkInboxNotificationReadInput = z.infer<
  typeof markInboxNotificationReadSchema
>;
