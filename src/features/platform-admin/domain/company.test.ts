import { describe, expect, it } from "vitest";

import {
  canTransitionCompanyStatus,
  isLegalCompanyStatus,
  normalizeEmail,
  normalizePersonName,
} from "./company";

describe("platform-admin company domain", () => {
  it("normalizes owner emails and names", () => {
    expect(normalizeEmail("  Owner@Atmata.example ")).toBe("owner@atmata.example");
    expect(normalizePersonName("  Ada   Lovelace ")).toBe("Ada Lovelace");
  });

  it("allows only active ↔ suspended", () => {
    expect(canTransitionCompanyStatus("active", "suspended")).toBe(true);
    expect(canTransitionCompanyStatus("suspended", "active")).toBe(true);
    expect(canTransitionCompanyStatus("active", "active")).toBe(true);
    expect(isLegalCompanyStatus("archived")).toBe(false);
  });
});
