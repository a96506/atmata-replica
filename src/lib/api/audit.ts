import type { AuditEvent, DocType } from "@/types";
import { listTable } from "@/lib/db/read";

const AUDIT_SELECT = "id,doc_id,doc_type,from_state,to_state,by,at,reason";

export async function listAuditEvents(
  docType: DocType,
  docId: string,
): Promise<AuditEvent[]> {
  return listTable<AuditEvent>(
    "audit_events",
    AUDIT_SELECT,
    [{ column: "at" }, { column: "id" }],
    [
      { column: "doc_type", value: docType },
      { column: "doc_id", value: docId },
    ],
  );
}

export async function listRecentAuditEvents(
  limit = 6,
): Promise<AuditEvent[]> {
  const rows = await listTable<AuditEvent>("audit_events", AUDIT_SELECT, [
    { column: "at", ascending: false },
    { column: "id", ascending: false },
  ]);
  return rows.slice(0, limit);
}
