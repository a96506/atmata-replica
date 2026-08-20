import { describe, expect, expectTypeOf, it } from "vitest";

import { actionFailure } from "./errors";
import type { ActionResult } from "./result";

describe("ActionResult", () => {
  it("uses the canonical nested failure envelope", () => {
    const result: ActionResult<never> = actionFailure("NOT_FOUND", {
      requestId: "req-result-contract",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "errors.notFound",
        retryable: false,
        requestId: "req-result-contract",
      },
    });
  });

  it("keeps successful data strongly typed", () => {
    const result: ActionResult<{ id: string }> = {
      ok: true,
      data: { id: "doc-1" },
      messageKey: "documents.saved",
    };

    if (result.ok) {
      expectTypeOf(result.data.id).toEqualTypeOf<string>();
    }
  });
});
