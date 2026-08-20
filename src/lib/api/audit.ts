import type { AuditEvent, DocType } from "@/types";
import { listTable } from "@/lib/db/read";

export async function listAuditEvents(
  docType: DocType,
  docId: string,
): Promise<AuditEvent[]> {
  return listTable(
    "audit_events",
    "id,doc_id,doc_type,from_state,to_state,by,at,reason",
    [{ column: "at" }, { column: "id" }],
    [
      { column: "doc_type", value: docType },
      { column: "doc_id", value: docId },
    ],
  );
}
