import { z } from "zod";

import { actionFailure } from "./errors";
import type { ActionResult } from "./result";

/**
 * Action inputs use strict objects so unrecognized client-supplied fields are
 * rejected at the server boundary.
 */
export const actionSchema = z.strictObject;

export function validateActionInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
  requestId?: string,
): ActionResult<z.output<TSchema>> {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const { fieldErrors } = z.flattenError(parsed.error);

  return actionFailure("VALIDATION", {
    fieldErrors: fieldErrors as Record<string, string[]>,
    requestId,
  });
}
