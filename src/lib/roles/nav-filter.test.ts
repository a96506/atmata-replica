import { describe, expect, it } from "vitest";
import { navigation } from "@/config/navigation";
import { filterNavigation, leafVisible } from "./nav-filter";

describe("leafVisible", () => {
  it("shows untagged leaves to every role", () => {
    expect(leafVisible({}, ["viewer"])).toBe(true);
    expect(leafVisible({}, ["sales_rep"])).toBe(true);
  });

  it("hides capability-tagged leaf from roles without access", () => {
    expect(
      leafVisible({ capabilities: ["buyer", "ap_clerk"] }, ["sales_rep"]),
    ).toBe(false);
  });

  it("allows readRoles without write capability", () => {
    expect(
      leafVisible(
        { capabilities: ["buyer"], readRoles: ["viewer", "accountant"] },
        ["viewer"],
      ),
    ).toBe(true);
  });

  it("admin always sees tagged leaves", () => {
    expect(leafVisible({ capabilities: ["buyer"] }, ["admin"])).toBe(true);
  });
});

describe("filterNavigation (Phase 2 acceptance)", () => {
  const moduleKeys = (roles: Parameters<typeof filterNavigation>[1]) =>
    filterNavigation(navigation, roles).map((m) => m.key);

  it("sales_rep: Sales yes; Purchasing + Accounting hidden", () => {
    const keys = moduleKeys(["sales_rep"]);
    expect(keys).toContain("sales");
    expect(keys).not.toContain("purchasing");
    expect(keys).not.toContain("accounting");
  });

  it("viewer: read modules present; Users leaf hidden", () => {
    const filtered = filterNavigation(navigation, ["viewer"]);
    expect(filtered.map((m) => m.key)).toEqual(
      expect.arrayContaining([
        "dashboard",
        "sales",
        "purchasing",
        "inventory",
        "accounting",
      ]),
    );
    const settings = filtered.find((m) => m.key === "settings");
    const hrefs =
      settings?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? [];
    expect(hrefs).not.toContain("/settings/users");
    expect(hrefs).not.toContain("/settings/approval-rules");
  });

  it("warehouse: Inventory yes; Accounting settings module hidden", () => {
    const keys = moduleKeys(["warehouse"]);
    expect(keys).toContain("inventory");
    expect(keys).toContain("purchasing");
    expect(keys).not.toContain("accounting");
  });

  it("ap_clerk: Purchasing includes OCR scan leaf", () => {
    const filtered = filterNavigation(navigation, ["ap_clerk"]);
    const purch = filtered.find((m) => m.key === "purchasing");
    const hrefs =
      purch?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? [];
    expect(hrefs).toContain("/accounting/invoices");
  });
});
