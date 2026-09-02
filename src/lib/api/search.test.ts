import { describe, expect, it } from "vitest";
import { hydrateDatabaseSearchResult } from "./search";

describe("database search hydration", () => {
  it("reconstructs locale-aware href functions client-side", () => {
    const result = hydrateDatabaseSearchResult({
      id: "db_purchase_order_po_1",
      kind: "doc",
      label: "PO-1",
      subtitle: "Purchase order",
      path: "/purchasing/purchase-orders/po_1",
    });
    expect(result.href("ar")).toBe("/ar/purchasing/purchase-orders/po_1");
  });
});

import {
  productSearchPath,
  productSkuFromSearchTitle,
} from "./search.server";

describe("product search paths", () => {
  it("extracts SKU from search_all title shape", () => {
    expect(productSkuFromSearchTitle("SKU-100 · Widget")).toBe("SKU-100");
  });

  it("routes products to inventory SKU page, not UUID", () => {
    expect(productSearchPath("SKU-100")).toBe("/inventory/products/SKU-100");
    expect(productSearchPath("A/B")).toBe("/inventory/products/A%2FB");
  });

  it("returns null when title has no SKU segment", () => {
    expect(productSkuFromSearchTitle(" · Name only")).toBeNull();
    expect(productSkuFromSearchTitle("")).toBeNull();
  });
});
