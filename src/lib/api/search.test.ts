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
