import type { RFQ } from "@/types";

/**
 * Seeded RFQ — adopted from PR-2026-00001 with 3 invited vendors.
 * One vendor (sup_1) was awarded; PO-2026-00001 was generated from it.
 */
export const RFQS: RFQ[] = [
  {
    id: "rfq_1",
    number: "RFQ-2026-00001",
    companyId: "co_1",
    prIds: ["pr_1"],
    date: "2026-04-10",
    expectedQuoteBy: "2026-04-12",
    state: "closed",
    invitedVendorIds: ["sup_1", "sup_2", "sup_4"],
    lines: [
      {
        id: "rfq_1_l1",
        productId: "prod_1",
        description: "Resin 25kg — Q2 production",
        qty: 80,
        prLineIds: ["pr_1_l1"],
      },
    ],
    quotes: [
      {
        id: "rfq_1_q_sup_1",
        vendorId: "sup_1",
        receivedDate: "2026-04-11",
        lineQuotes: [
          { rfqLineId: "rfq_1_l1", unitPrice: 12.4, leadTimeDays: 5 },
        ],
        currency: "KWD",
        total: 80 * 12.4,
        validUntil: "2026-05-11",
      },
      {
        id: "rfq_1_q_sup_2",
        vendorId: "sup_2",
        receivedDate: "2026-04-11",
        lineQuotes: [
          { rfqLineId: "rfq_1_l1", unitPrice: 12.9, leadTimeDays: 3 },
        ],
        currency: "KWD",
        total: 80 * 12.9,
        validUntil: "2026-05-11",
      },
      {
        id: "rfq_1_q_sup_4",
        vendorId: "sup_4",
        receivedDate: "2026-04-12",
        lineQuotes: [
          {
            rfqLineId: "rfq_1_l1",
            unitPrice: 13.2,
            leadTimeDays: 7,
            notes: "USD-pricing, FX risk",
          },
        ],
        currency: "USD",
        total: 80 * 13.2,
        validUntil: "2026-05-12",
      },
    ],
    award: {
      vendorId: "sup_1",
      quoteId: "rfq_1_q_sup_1",
      awardedAt: "2026-04-12",
      awardedBy: "Demo User",
      poId: "po_1",
    },
    notes: "Awarded to sup_1 (best price, in-policy lead time).",
  },
];
