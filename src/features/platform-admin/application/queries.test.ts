import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listCompanies = vi.fn();
const getCompany = vi.fn();

vi.mock("../infrastructure/insforge-repository", () => ({
  listCompanies,
  getCompany,
  getCompanyRowCounts: vi.fn(),
  getCompanyAudit: vi.fn(),
}));

describe("platform-admin queries", () => {
  it("passes list filters to the repository", async () => {
    listCompanies.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 50 });
    const queries = await import("./queries");
    await queries.listCompanies({ search: "acme", status: "active", offset: 0, limit: 50 });
    expect(listCompanies).toHaveBeenCalledWith({
      search: "acme",
      status: "active",
      offset: 0,
      limit: 50,
    });
  });
});
