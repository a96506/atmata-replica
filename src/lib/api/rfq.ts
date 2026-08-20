import type { RFQ } from "@/types";
import { getTable, listTable } from "@/lib/db/read";
import { RFQ_SELECT } from "@/lib/db/selects";

type RfqRow = Omit<RFQ, "prIds" | "invitedVendorIds" | "award" | "lines" | "quotes"> & {
  awardedVendorId: string | null;
  awardedQuoteId: string | null;
  awardPoId: string | null;
  awardedAt: string | null;
  awardedBy: string | null;
  sources: Array<{ purchaseRequisitionId: string }>;
  invited: Array<{ supplierId: string }>;
  lines: Array<{
    id: string;
    productId: string;
    description: string;
    qty: number;
    lineSources: Array<{ purchaseRequisitionLineId: string }>;
  }>;
  quotes: Array<{
    id: string;
    vendorId: string;
    receivedDate: string;
    currency: RFQ["quotes"][number]["currency"];
    total: number;
    validUntil?: string;
    lineQuotes: RFQ["quotes"][number]["lineQuotes"];
  }>;
};

export function assembleRfq(row: RfqRow): RFQ {
  const {
    sources,
    invited,
    awardedVendorId,
    awardedQuoteId,
    awardPoId,
    awardedAt,
    awardedBy,
    ...base
  } = row;
  return {
    ...base,
    prIds: sources.map((source) => source.purchaseRequisitionId),
    invitedVendorIds: invited.map((entry) => entry.supplierId),
    lines: row.lines.map(({ lineSources, ...line }) => ({
      ...line,
      prLineIds: lineSources.map((source) => source.purchaseRequisitionLineId),
    })),
    quotes: row.quotes,
    ...(awardedVendorId && awardedQuoteId && awardedAt && awardedBy
      ? {
          award: {
            vendorId: awardedVendorId,
            quoteId: awardedQuoteId,
            awardedAt,
            awardedBy,
            ...(awardPoId ? { poId: awardPoId } : {}),
          },
        }
      : {}),
  };
}

export async function listRfqs(): Promise<RFQ[]> {
  const rows = await listTable<RfqRow>("rfqs", RFQ_SELECT, [
    { column: "date", ascending: false },
    { column: "number", ascending: false },
    { column: "id" },
  ]);
  return rows.map(assembleRfq);
}

export async function getRfq(id: string): Promise<RFQ | null> {
  const row = await getTable<RfqRow>("rfqs", RFQ_SELECT, id);
  return row ? assembleRfq(row) : null;
}
