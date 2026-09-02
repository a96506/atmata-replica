import type { AuditEvent, AuditActor, DocType } from "@/types";
import {
  getReadClient,
  listPage,
  listTable,
  mapRows,
  requireData,
  type ListPageResult,
} from "@/lib/db/read";

/**
 * Audit-event reads. The `by` column stores a raw user UUID; we resolve it to
 * a display name/email via `user_profiles` (the same table the user-admin
 * feature uses). `event_type` + `change_detail` are added by a parallel
 * migration — read defensively: try the wide projection first, fall back to
 * the narrow one if the columns are absent.
 */

const AUDIT_SELECT_NARROW = "id,doc_id,doc_type,from_state,to_state,by,at,reason";
const AUDIT_SELECT_WIDE = `${AUDIT_SELECT_NARROW},event_type,change_detail`;

/** True when the backend accepts the wide projection (change-detail migration applied). */
async function wideProjectionAvailable(): Promise<boolean> {
  const client = await getReadClient();
  // One-row probe with the wide projection. Any column-missing error means
  // the migration hasn't landed yet → fall back to the narrow projection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("audit_events")
    .select(AUDIT_SELECT_WIDE)
    .range(0, 0);
  return !result.error;
}

async function resolveActors(userIds: string[]): Promise<Map<string, AuditActor>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("user_profiles")
    .select("id,full_name,email")
    .in("id", ids);
  if (result.error || !result.data) return new Map();
  const rows = mapRows<{ id: string; full_name: string | null; email: string | null }>(
    result.data,
  );
  return new Map(
    rows.map((row) => [
      row.id,
      { fullName: row.full_name, email: row.email },
    ]),
  );
}

function attachActors(events: AuditEvent[]): Promise<AuditEvent[]> {
  const ids = events.map((e) => e.by).filter((v): v is string => Boolean(v));
  return resolveActors(ids).then((actors) =>
    events.map((e) => ({
      ...e,
      actor: e.by ? actors.get(e.by) ?? null : null,
    })),
  );
}

export async function listAuditEvents(
  docType: DocType,
  docId: string,
): Promise<AuditEvent[]> {
  const projection = (await wideProjectionAvailable())
    ? AUDIT_SELECT_WIDE
    : AUDIT_SELECT_NARROW;
  const rows = await listTable<AuditEvent>(
    "audit_events",
    projection,
    [{ column: "at" }, { column: "id" }],
    [
      { column: "doc_type", value: docType },
      { column: "doc_id", value: docId },
    ],
  );
  return attachActors(rows);
}

export async function listRecentAuditEvents(
  limit = 6,
): Promise<AuditEvent[]> {
  const projection = (await wideProjectionAvailable())
    ? AUDIT_SELECT_WIDE
    : AUDIT_SELECT_NARROW;
  const rows = await listTable<AuditEvent>("audit_events", projection, [
    { column: "at", ascending: false },
    { column: "id", ascending: false },
  ]);
  const withActors = await attachActors(rows);
  return withActors.slice(0, limit);
}

/** Company-wide audit feed for `/settings/audit` (newest first, server-paged). */
export async function listCompanyAuditEventsPage(params: {
  limit: number;
  offset: number;
}): Promise<ListPageResult<AuditEvent>> {
  const projection = (await wideProjectionAvailable())
    ? AUDIT_SELECT_WIDE
    : AUDIT_SELECT_NARROW;
  const page = await listPage<AuditEvent>(
    "audit_events",
    projection,
    [
      { column: "at", ascending: false },
      { column: "id", ascending: false },
    ],
    [],
    params,
  );
  return {
    ...page,
    items: await attachActors(page.items),
  };
}

/**
 * Low-level insert used by server actions that need to write an audit event
 * outside the normal state-transition RPC (e.g. attachment add/remove).
 * Writes defensively: if `event_type`/`change_detail` columns are absent the
 * insert omits them and retries with the narrow column set.
 */
export async function writeAuditEvent(input: {
  docType: DocType;
  docId: string;
  fromState?: string | null;
  toState?: string | null;
  by?: string | null;
  reason?: string | null;
  eventType?: string;
  changeDetail?: Record<string, unknown> | null;
}): Promise<void> {
  const { getReadClient } = await import("@/lib/db/read");
  const client = await getReadClient();
  const base: Record<string, unknown> = {
    doc_type: input.docType,
    doc_id: input.docId,
    from_state: input.fromState ?? null,
    to_state: input.toState ?? null,
    by: input.by ?? null,
    reason: input.reason ?? null,
  };
  const wide: Record<string, unknown> = {
    ...base,
    event_type: input.eventType ?? "state_transition",
    ...(input.changeDetail ? { change_detail: input.changeDetail } : {}),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = await client.database.from("audit_events").insert([wide]);
  if (!result.error) return;
  const msg = String(result.error.message ?? "");
  // Column-missing → retry with the narrow projection (migration not applied yet).
  if (/event_type|change_detail|column/i.test(msg)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await client.database.from("audit_events").insert([base]);
  }
  if (result.error) {
    throw new Error(result.error.message ?? "audit_events insert failed");
  }
}

// Re-export requireData for callers that build ad-hoc audit reads.
export { requireData };
