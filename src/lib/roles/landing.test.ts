import { describe, expect, it } from "vitest";
import { landingPathForRoles, resolvePrimaryRole } from "./landing";

describe("resolvePrimaryRole", () => {
  it("prefers admin over every other role", () => {
    expect(resolvePrimaryRole(["viewer", "admin", "buyer"])).toBe("admin");
  });

  it("prefers approver over desk roles and viewer", () => {
    expect(resolvePrimaryRole(["viewer", "approver", "buyer"])).toBe("approver");
  });

  it("uses desk precedence when multiple desk roles are held", () => {
    expect(resolvePrimaryRole(["warehouse", "buyer", "ar_clerk"])).toBe("ar_clerk");
  });

  it("does not use roles[0] when a higher-precedence role appears later", () => {
    expect(resolvePrimaryRole(["viewer", "accountant"])).toBe("accountant");
    expect(resolvePrimaryRole(["viewer", "sales_rep"])).toBe("sales_rep");
  });

  it("falls back to viewer for empty roles", () => {
    expect(resolvePrimaryRole([])).toBe("viewer");
  });
});

describe("landingPathForRoles", () => {
  it("maps each persona to its home route", () => {
    expect(landingPathForRoles(["approver"])).toBe("/inbox");
    expect(landingPathForRoles(["admin"])).toBe("/dashboard");
    expect(landingPathForRoles(["accountant"])).toBe("/accounting/journal-entries");
    expect(landingPathForRoles(["sales_rep"])).toBe("/sales");
    expect(landingPathForRoles(["ar_clerk"])).toBe("/sales/invoices");
    expect(landingPathForRoles(["ap_clerk"])).toBe("/purchasing/bills");
    expect(landingPathForRoles(["buyer"])).toBe("/purchasing/purchase-orders");
    expect(landingPathForRoles(["warehouse"])).toBe("/inventory/stock-moves");
    expect(landingPathForRoles(["viewer"])).toBe("/dashboard");
  });
});
