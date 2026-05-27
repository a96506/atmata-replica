import { RFQS } from "@/mocks/seed/rfq";
import type { RFQ } from "@/types";

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listRfqs(): Promise<RFQ[]> {
  return RFQS;
}

export async function getRfq(id: string): Promise<RFQ | null> {
  return byId(RFQS, id);
}
