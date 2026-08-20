import { describe, expect, it } from "vitest";
import { z } from "zod";

import { actionSchema, validateActionInput } from "./validation";

const commandSchema = actionSchema({
  documentId: z.string().min(1, "Document is required"),
  expectedRowVersion: z.number().int().nonnegative(),
});

describe("action validation", () => {
  it("returns parsed data from safeParse", () => {
    const result = validateActionInput(commandSchema, {
      documentId: "po-1",
      expectedRowVersion: 3,
    });

    expect(result).toEqual({
      ok: true,
      data: { documentId: "po-1", expectedRowVersion: 3 },
    });
  });

  it("rejects unknown fields through strict schemas", () => {
    const result = validateActionInput(
      commandSchema,
      {
        documentId: "po-1",
        expectedRowVersion: 3,
        companyId: "client-supplied-company",
      },
      "req-strict",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.requestId).toBe("req-strict");
    }
  });

  it("uses z.flattenError field errors", () => {
    const result = validateActionInput(
      commandSchema,
      { documentId: "", expectedRowVersion: -1 },
      "req-fields",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION",
        messageKey: "errors.validation",
        fieldErrors: {
          documentId: ["Document is required"],
          expectedRowVersion: [
            "Too small: expected number to be >=0",
          ],
        },
        retryable: false,
        requestId: "req-fields",
      },
    });
  });
});
