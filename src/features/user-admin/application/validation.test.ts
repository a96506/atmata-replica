import { describe, expect, it } from "vitest";
import { KnownActionError } from "@/lib/actions/errors";
import { normalizeEmail, parseInviteInput } from "./validation";
import { deriveInvitationToken, hashInvitationToken } from "./token";

describe("email normalization", () => {
  it("lowercases and trims valid addresses", () => {
    expect(normalizeEmail("  Owner@X.example ")).toBe("owner@x.example");
  });

  it("rejects empty and malformed addresses", () => {
    expect(() => normalizeEmail("")).toThrow(KnownActionError);
    expect(() => normalizeEmail("not-an-email")).toThrow(KnownActionError);
  });
});

describe("role validation", () => {
  it("rejects empty, duplicate-only-invalid, unknown, and ai_agent", () => {
    expect(() =>
      parseInviteInput({
        locale: "en",
        email: "a@b.co",
        roles: [],
        requestId: "c2f4e8a0-4b1c-4d2e-a3f4-5b6c7d8e9f00",
      }),
    ).toThrow(KnownActionError);
    expect(() =>
      parseInviteInput({
        locale: "en",
        email: "a@b.co",
        roles: ["ai_agent"],
        requestId: "c2f4e8a0-4b1c-4d2e-a3f4-5b6c7d8e9f00",
      }),
    ).toThrow(KnownActionError);
    expect(() =>
      parseInviteInput({
        locale: "en",
        email: "a@b.co",
        roles: ["wizard"],
        requestId: "c2f4e8a0-4b1c-4d2e-a3f4-5b6c7d8e9f00",
      }),
    ).toThrow(KnownActionError);
  });
});

describe("invitation tokens", () => {
  it("is deterministic for the same company, email, and request id", () => {
    const input = {
      companyId: "co_1",
      email: "user@example.com",
      requestId: "c2f4e8a0-4b1c-4d2e-a3f4-5b6c7d8e9f00",
      secret: "0".repeat(32),
    };
    const first = deriveInvitationToken(input);
    const second = deriveInvitationToken(input);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(hashInvitationToken(first)).toHaveLength(64);
    expect(hashInvitationToken(first)).not.toBe(first);
  });
});
