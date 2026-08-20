import { z } from "zod";

import { actionSchema } from "../validation";
import { writeCommandBaseSchema } from "./common";
import {
  isoDateSchema,
  writeIntentSchema,
  writeSourceSchema,
} from "./p2p";

export const createInternalTransferSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    fromWarehouseId: z.string().trim().min(1),
    toWarehouseId: z.string().trim().min(1),
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }).refine(
    (header) => header.fromWarehouseId !== header.toWarehouseId,
    { message: "fromWarehouseId and toWarehouseId must differ" },
  ),
  lines: z
    .array(
      actionSchema({
        productId: z.string().trim().min(1),
        qty: z.number().positive(),
        lotNumber: z.string().trim().min(1).optional(),
      }),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export const createStockAdjustmentSchema = writeCommandBaseSchema.extend({
  intent: writeIntentSchema,
  header: actionSchema({
    date: isoDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
  }),
  lines: z
    .array(
      actionSchema({
        productId: z.string().trim().min(1),
        warehouseId: z.string().trim().min(1),
        qtyDelta: z.number().refine((n) => n !== 0, {
          message: "qtyDelta must be non-zero",
        }),
        reason: z.string().trim().min(1).max(500),
      }),
    )
    .min(1),
  source: writeSourceSchema.optional(),
});

export type CreateInternalTransferInput = z.infer<
  typeof createInternalTransferSchema
>;
export type CreateStockAdjustmentInput = z.infer<
  typeof createStockAdjustmentSchema
>;
