import { describe, expect, it } from "vitest";
import { assembleRfq } from "./rfq";

describe("RFQ relational assembly", () => {
  it("flattens source, invitation, lineage and award relations", () => {
    const result = assembleRfq({
      id: "rfq_1",
      rowVersion: 2,
      number: "RFQ-1",
      companyId: "co_1",
      date: "2026-08-01",
      expectedQuoteBy: "2026-08-10",
      state: "awarded",
      notes: "test",
      sources: [{ purchaseRequisitionId: "pr_1" }],
      invited: [{ supplierId: "sup_1" }],
      lines: [
        {
          id: "line_1",
          productId: "prod_1",
          description: "Item",
          qty: 2,
          lineSources: [{ purchaseRequisitionLineId: "pr_line_1" }],
        },
      ],
      quotes: [
        {
          id: "quote_1",
          vendorId: "sup_1",
          receivedDate: "2026-08-05",
          currency: "KWD",
          total: 20,
          lineQuotes: [
            { rfqLineId: "line_1", unitPrice: 10, leadTimeDays: 2 },
          ],
        },
      ],
      awardedVendorId: "sup_1",
      awardedQuoteId: "quote_1",
      awardPoId: "po_1",
      awardedAt: "2026-08-06T00:00:00Z",
      awardedBy: "user_1",
    });

    expect(result.prIds).toEqual(["pr_1"]);
    expect(result.invitedVendorIds).toEqual(["sup_1"]);
    expect(result.lines[0]?.prLineIds).toEqual(["pr_line_1"]);
    expect(result.award?.poId).toBe("po_1");
  });
});
