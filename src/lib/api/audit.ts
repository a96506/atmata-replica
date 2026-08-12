import { AUDIT_EVENTS } from "@/mocks/seed/audit";
import type { AuditEvent, DocType } from "@/types";

export async function listAuditEvents(
  docType: DocType,
  docId: string,
): Promise<AuditEvent[]> {
  return AUDIT_EVENTS.filter((e) => e.docType === docType && e.docId === docId).sort(
    (a, b) => a.at.localeCompare(b.at),
  );
}
