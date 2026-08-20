import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionFailure } from "@/lib/actions/errors";

vi.mock("server-only", () => ({}));

const inviteUser = vi.fn();
const setMemberRoles = vi.fn();
const deactivateMember = vi.fn();

vi.mock("@/features/user-admin/application/service", () => ({
  inviteUser,
  setMemberRoles,
  deactivateMember,
  listUserAdminPage: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("user-admin actions", () => {
  beforeEach(() => {
    inviteUser.mockReset();
    setMemberRoles.mockReset();
    deactivateMember.mockReset();
  });

  it("maps validation failures to the shared envelope", async () => {
    const { inviteUserAction } = await import("./user-admin");
    const result = await inviteUserAction({
      locale: "en",
      email: "not-an-email",
      roles: ["viewer"],
      requestId: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.requestId).toBeTruthy();
    }
    expect(inviteUser).not.toHaveBeenCalled();
  });

  it("returns the invite payload on success", async () => {
    const requestId = "c2f4e8a0-4b1c-4d2e-a3f4-5b6c7d8e9f00";
    inviteUser.mockResolvedValue({
      invitationId: "inv_1",
      email: "new@example.com",
      invitationLink: "http://localhost:3000/en/invitation?token=abc",
      emailDelivered: false,
      requestId,
    });
    const { inviteUserAction } = await import("./user-admin");
    const result = await inviteUserAction({
      locale: "en",
      email: "new@example.com",
      roles: ["viewer"],
      requestId,
    });
    expect(result).toMatchObject({
      ok: true,
      messageKey: "settings.users.invite.emailFailed",
    });
  });

  it("uses actionFailure for unexpected mapping smoke", () => {
    expect(actionFailure("INTERNAL", { requestId: "x" }).ok).toBe(false);
  });
});
