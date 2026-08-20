import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const setCompanyStatus = vi.fn();
const provisionCompany = vi.fn();
const resendOwnerInvitation = vi.fn();

vi.mock("../infrastructure/insforge-repository", () => ({
  setCompanyStatus,
  provisionCompany,
  resendOwnerInvitation,
}));

describe("platform-admin commands", () => {
  beforeEach(() => {
    setCompanyStatus.mockReset();
    provisionCompany.mockReset();
    resendOwnerInvitation.mockReset();
  });

  it("rejects empty suspend reasons before calling the repository", async () => {
    const { suspendCompany } = await import("./commands");
    await expect(
      suspendCompany({ companyId: "co_x", expectedRowVersion: 1, reason: "  " }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(setCompanyStatus).not.toHaveBeenCalled();
  });

  it("normalizes provision input", async () => {
    provisionCompany.mockResolvedValue({ companyId: "co_new", invitationId: "inv_1" });
    const { provisionCompany: command } = await import("./commands");
    await command({
      operationId: "11111111-1111-1111-1111-111111111111",
      name: "  New Co  ",
      ownerEmail: "  Owner@X.example ",
      ownerName: "  Ada   Lovelace ",
    });
    expect(provisionCompany).toHaveBeenCalledWith({
      operationId: "11111111-1111-1111-1111-111111111111",
      name: "New Co",
      ownerEmail: "owner@x.example",
      ownerName: "Ada Lovelace",
    });
  });
});
