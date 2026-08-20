import { describe, expect, it } from "vitest";

import { parsePlatformRpcError } from "./errors";

describe("platform RPC error parser", () => {
  it("maps PLATFORM codes and stale versions", () => {
    expect(parsePlatformRpcError("PLATFORM:FORBIDDEN")).toEqual({ code: "FORBIDDEN" });
    expect(parsePlatformRpcError("PLATFORM:STALE_VERSION:4")).toEqual({
      code: "STALE_VERSION",
      currentRowVersion: 4,
    });
    expect(parsePlatformRpcError("boom")).toEqual({ code: "INTERNAL" });
  });
});
