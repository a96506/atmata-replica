import { describe, expect, it } from "vitest";

import { parseWriteRpcError } from "../errors";
import { validateActionInput } from "../validation";
import {
  postDocumentSchema,
  reverseDocumentSchema,
  transitionDocumentSchema,
} from "./common";

describe("write command schemas", () => {
  const base = {
    locale: "en" as const,
    docType: "po" as const,
    docId: "po_1",
    expectedRowVersion: 2,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };

  it("accepts a valid transition payload", () => {
    const result = validateActionInput(transitionDocumentSchema, {
      ...base,
      action: "submit",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects client-supplied companyId on transition", () => {
    const result = validateActionInput(
      transitionDocumentSchema,
      {
        ...base,
        action: "submit",
        companyId: "co_evil",
      },
      "req-write-strict",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.requestId).toBe("req-write-strict");
    }
  });

  it("requires positive expectedRowVersion for post", () => {
    const result = validateActionInput(postDocumentSchema, {
      ...base,
      expectedRowVersion: 0,
    });

    expect(result.ok).toBe(false);
  });

  it("accepts optional reverse reason", () => {
    const result = validateActionInput(reverseDocumentSchema, {
      ...base,
      docType: "grn",
      reason: "wrong qty posted",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        locale: "en",
        docType: "grn",
        docId: "po_1",
        expectedRowVersion: 2,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        reason: "wrong qty posted",
      },
    });
  });
});

describe("parseWriteRpcError", () => {
  it("parses WRITE codes and stale versions", () => {
    expect(parseWriteRpcError("WRITE:FORBIDDEN")).toEqual({
      code: "FORBIDDEN",
      detail: undefined,
    });
    expect(parseWriteRpcError("WRITE:STALE_VERSION:7")).toEqual({
      code: "STALE_VERSION",
      currentRowVersion: 7,
      detail: "7",
    });
    expect(parseWriteRpcError("WRITE:PERIOD_CLOSED:soft closed")).toEqual({
      code: "PERIOD_CLOSED",
      detail: "soft closed",
    });
    expect(parseWriteRpcError("something else")).toEqual({ code: "INTERNAL" });
  });
});
