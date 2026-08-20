import { describe, expect, it } from "vitest";
import { isLastActiveOwner, normalizeRoles } from "./roles";

describe("normalizeRoles", () => {
  it("deduplicates and sorts", () => {
    expect(normalizeRoles(["viewer", "admin", "viewer"])).toEqual(["admin", "viewer"]);
  });

  it("rejects unknown and ai_agent", () => {
    expect(() => normalizeRoles(["not_a_role"])).toThrow();
    expect(() => normalizeRoles(["ai_agent"])).toThrow();
  });
});

describe("isLastActiveOwner", () => {
  it("is true only for the last active owner administrator", () => {
    expect(
      isLastActiveOwner(
        { isOwner: true, active: true, roles: ["admin"] },
        1,
      ),
    ).toBe(true);
    expect(
      isLastActiveOwner(
        { isOwner: true, active: true, roles: ["admin"] },
        2,
      ),
    ).toBe(false);
  });
});
