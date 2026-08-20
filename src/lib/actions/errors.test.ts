import { describe, expect, it, vi } from "vitest";

import { KnownActionError, normalizeActionError } from "./errors";

describe("normalizeActionError", () => {
  it("preserves only explicitly mapped, client-safe error fields", () => {
    const result = normalizeActionError(
      new KnownActionError("STALE_VERSION", {
        currentRowVersion: 8,
        retryable: true,
      }),
      { requestId: "req-known" },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STALE_VERSION",
        messageKey: "errors.staleVersion",
        retryable: true,
        currentRowVersion: 8,
        requestId: "req-known",
      },
    });
  });

  it("converts unexpected provider errors to INTERNAL without leaking details", () => {
    const unexpected = new Error(
      'relation "vendor_bills" violates policy tenant_bill_policy',
    );
    const onUnexpected = vi.fn();

    const result = normalizeActionError(unexpected, {
      requestId: "req-unexpected",
      onUnexpected,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        messageKey: "errors.internal",
        retryable: false,
        requestId: "req-unexpected",
      },
    });
    expect(JSON.stringify(result)).not.toContain("vendor_bills");
    expect(JSON.stringify(result)).not.toContain("tenant_bill_policy");
    expect(onUnexpected).toHaveBeenCalledWith(unexpected, "req-unexpected");
  });

  it("generates a request ID when none is supplied", () => {
    const result = normalizeActionError(new Error("SDK failure"));

    expect(result.error.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
