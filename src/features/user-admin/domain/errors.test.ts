import { describe, expect, it } from "vitest";
import { parseUserAdminRpcError } from "./errors";

describe("parseUserAdminRpcError", () => {
  it("maps stable SQL messages to ActionError codes", () => {
    expect(parseUserAdminRpcError("company admin required")).toBe("FORBIDDEN");
    expect(parseUserAdminRpcError("invalid human role set")).toBe("VALIDATION");
    expect(parseUserAdminRpcError("member not found")).toBe("NOT_FOUND");
    expect(parseUserAdminRpcError("request id was already used with different invitation data")).toBe(
      "CONFLICT",
    );
    expect(parseUserAdminRpcError("cannot deactivate last active owner")).toBe("INVARIANT");
    expect(parseUserAdminRpcError("boom")).toBe("INTERNAL");
  });
});
