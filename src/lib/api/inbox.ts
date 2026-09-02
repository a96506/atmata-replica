import { getReadClient, mapOne, mapRows, maybeOne, requireData } from "@/lib/db/read";
import { INBOX_SELECTS } from "@/lib/db/selects";
import { DOC_PATH_BY_TYPE, docPath } from "@/lib/api/doc-paths";

/** Maps DocType codes to Postgres table names (mirrors document_table_name). */
const DOCUMENT_TABLE_BY_TYPE: Record<string, string> = {
  pr: "purchase_requisitions",
  rfq: "rfqs",
  po: "purchase_orders",
  grn: "goods_receipts",
  vendor_bill: "vendor_bills",
  vendor_payment: "vendor_payments",
  vendor_return: "vendor_returns",
  debit_note: "debit_notes",
  quote: "quotes",
  so: "sales_orders",
  dn: "delivery_notes",
  customer_invoice: "customer_invoices",
  customer_receipt: "customer_receipts",
  customer_return: "customer_returns",
  credit_note: "credit_notes",
  journal_entry: "journal_entries",
  stock_adjustment: "stock_adjustments",
  internal_transfer: "internal_transfers",
};

// Re-export so existing `inboxDocPath` importers keep working. The canonical
// pure helper lives in `lib/api/doc-paths` (safe for client components).
export { docPath as inboxDocPath, DOC_PATH_BY_TYPE };

export type InboxNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  docType: string | null;
  docId: string | null;
  readAt: string | null;
  createdAt: string;
  rowVersion?: number | null;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  docType: string | null;
  docId: string | null;
  readAt: string | null;
  createdAt: string;
};

async function lookupDocRowVersions(
  pairs: Array<{ docType: string; docId: string }>,
): Promise<Map<string, number>> {
  const versions = new Map<string, number>();
  if (pairs.length === 0) return versions;

  const byTable = new Map<string, { docType: string; ids: Set<string> }>();
  for (const { docType, docId } of pairs) {
    const table = DOCUMENT_TABLE_BY_TYPE[docType];
    if (!table) continue;
    const entry = byTable.get(table) ?? { docType, ids: new Set<string>() };
    entry.ids.add(docId);
    byTable.set(table, entry);
  }

  const client = await getReadClient();
  await Promise.all(
    [...byTable.entries()].map(async ([table, { docType, ids }]) => {
      const idList = [...ids];
      if (idList.length === 0) return;
      try {
        // Dynamic document table — same pattern as document_table_name().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.database
          .from(table)
          .select("id, row_version")
          .in("id", idList);
        if (result.error || !result.data) return;
        const rows = mapRows<{ id: string; rowVersion: number }>(result.data);
        for (const row of rows) {
          versions.set(`${docType}:${row.id}`, row.rowVersion);
        }
      } catch {
        /* leave rowVersion null for this doc type batch */
      }
    }),
  );

  return versions;
}

/**
 * Notifications for the signed-in user (RLS scopes by recipient).
 * Unread first, then newest created_at. Caps at 50.
 */
export async function listInboxNotifications(): Promise<InboxNotification[]> {
  const client = await getReadClient();
  const result = await client.database
    .from("notifications")
    .select(INBOX_SELECTS.notifications)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = mapRows<NotificationRow>(requireData(result, "notifications"));

  rows.sort((a, b) => {
    const aUnread = a.readAt ? 1 : 0;
    const bUnread = b.readAt ? 1 : 0;
    if (aUnread !== bUnread) return aUnread - bUnread;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const versionPairs = rows.flatMap((row) =>
    row.docType && row.docId
      ? [{ docType: row.docType, docId: row.docId }]
      : [],
  );
  const versions = await lookupDocRowVersions(versionPairs);

  const fromNotifications = rows.map((row) => {
    const key =
      row.docType && row.docId ? `${row.docType}:${row.docId}` : null;
    // Fanout uses kind=system + title=schedule_failure|fx_stale with raw summary bodies.
    // Keep machine title for UI detection; replace body with human English.
    const human =
      row.title === "schedule_failure" || row.title === "fx_stale"
        ? humanizeOpsBody(row.title, { summary: row.body })
        : null;
    return {
      ...row,
      body: human ?? row.body,
      rowVersion: key ? (versions.get(key) ?? null) : null,
    };
  });

  // Merge pending-approval documents into the feed so the inbox reflects the
  // same "documents awaiting approval" count the dashboard shows. We
  // synthesize an unread inbox item per pending doc that isn't already
  // represented by a notification (dedup by `${docType}:${docId}`).
  const pendingItems = await listPendingApprovalItems(client);
  // Resolve row_versions for the pending docs so the inbox's approve/reject
  // flow can drive a real state transition.
  const pendingVersionPairs = pendingItems.map((item) => ({
    docType: item.docType!,
    docId: item.docId!,
  }));
  const pendingVersions = await lookupDocRowVersions(pendingVersionPairs);
  for (const item of pendingItems) {
    const key = `${item.docType}:${item.docId}`;
    item.rowVersion = pendingVersions.get(key) ?? null;
  }

  const seen = new Set(
    fromNotifications
      .filter((n) => n.docType && n.docId)
      .map((n) => `${n.docType}:${n.docId}`),
  );
  const merged: InboxNotification[] = [...fromNotifications];
  for (const item of pendingItems) {
    const key = `${item.docType}:${item.docId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  // Open operational alerts (reorder, FX stale, etc.) — company-scoped SELECT.
  // Dedup against notifications that already reference the same alert id via
  // synthesized id `ops:{alertId}` or matching title/body is imperfect; we
  // skip when a notification kind already equals the alert kind and body
  // contains the same subject (lightweight). Primary dedup: ops: id prefix.
  const opsItems = await listOpenOperationalAlertItems(client);
  const seenOps = new Set(
    merged.filter((n) => n.id.startsWith("ops:")).map((n) => n.id),
  );
  // Also skip when a real notification already carries operational_alert kind
  // with identical title (fanout may have created one for this user).
  const notifTitles = new Set(
    fromNotifications.map((n) => `${n.kind}|${n.title}`),
  );
  for (const item of opsItems) {
    if (seenOps.has(item.id)) continue;
    if (notifTitles.has(`${item.kind}|${item.title}`)) continue;
    seenOps.add(item.id);
    merged.push(item);
  }

  // Unread first, then newest created_at.
  merged.sort((a, b) => {
    const aUnread = a.readAt ? 1 : 0;
    const bUnread = b.readAt ? 1 : 0;
    if (aUnread !== bUnread) return aUnread - bUnread;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return merged;
}

/**
 * Pending-approval documents across the same tables the dashboard counts.
 * Returns synthesized InboxNotification rows (kind="approval_requested",
 * unread) so the inbox feed surfaces them even when no notification row
 * exists yet. Defensive: a failed read on any table degrades to an empty
 * list for that table.
 */
const PENDING_APPROVAL_SOURCES: Array<{
  table: string;
  docType: string;
  label: string;
}> = [
  { table: "purchase_orders", docType: "po", label: "Purchase order" },
  { table: "vendor_bills", docType: "vendor_bill", label: "Vendor bill" },
  { table: "quotes", docType: "quote", label: "Quote" },
  { table: "sales_orders", docType: "so", label: "Sales order" },
  { table: "journal_entries", docType: "journal_entry", label: "Journal entry" },
];

async function listPendingApprovalItems(
  client: Awaited<ReturnType<typeof getReadClient>>,
): Promise<InboxNotification[]> {
  const items: InboxNotification[] = [];
  await Promise.all(
    PENDING_APPROVAL_SOURCES.map(async ({ table, docType, label }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.database
          .from(table)
          .select("id,number,created_at")
          .eq("state", "pending")
          .order("created_at", { ascending: false })
          .limit(25);
        if (result.error || !result.data) return;
        const rows = mapRows<{
          id: string;
          number: string;
          createdAt: string;
        }>(result.data);
        for (const row of rows) {
          items.push({
            id: `pending:${docType}:${row.id}`,
            kind: "approval_requested",
            title: `${label} awaiting approval`,
            body: `${row.number} is pending your review.`,
            docType,
            docId: row.id,
            readAt: null,
            createdAt: row.createdAt,
            rowVersion: null,
          });
        }
      } catch {
        /* leave this table's contribution empty */
      }
    }),
  );
  return items;
}


type OperationalAlertRow = {
  id: string;
  kind: string;
  subjectType: string | null;
  subjectId: string | null;
  severity: string;
  status: string;
  payload: Record<string, unknown> | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
};

const OPS_KIND_TITLE: Record<string, string> = {
  reorder: "Reorder alert",
  stale_draft: "Stale draft",
  abc: "ABC class change",
  schedule_failure: "Schedule failure",
  fx_stale: "FX rates need attention",
  depreciation_blocked: "Depreciation blocked",
};

/** Map technical schedule/FX payload summaries to human English (UI i18n overlays EN+AR). */
function humanizeOpsBody(
  kind: string,
  payload: Record<string, unknown> | null,
): string | null {
  if (kind === "schedule_failure") {
    const job = typeof payload?.job === "string" ? payload.job.trim() : "";
    if (job) {
      return `Scheduled job "${job}" failed. Review ops health in Settings.`;
    }
    return "A scheduled job failed. Review ops health in Settings — rates were not marked successful.";
  }
  if (kind === "fx_stale") {
    const summary =
      typeof payload?.summary === "string" ? payload.summary.toLowerCase() : "";
    if (summary.includes("provider") || summary.includes("fetch failed")) {
      return "FX rate provider fetch failed. Rates were not updated — check FX rates in Settings.";
    }
    if (summary.includes("older than") || summary.includes("three days")) {
      return "FX rates are older than three days. Refresh rates in Settings.";
    }
    return "FX rates need attention. Check Settings → FX rates (ops health is unchanged).";
  }
  return null;
}

/**
 * Open operational_alerts for the caller's company (RLS). Synthesized as
 * unread inbox items (id `ops:{alertId}`) so the feed surfaces them even
 * when fanout did not create a personal notification.
 */
async function listOpenOperationalAlertItems(
  client: Awaited<ReturnType<typeof getReadClient>>,
): Promise<InboxNotification[]> {
  try {
    const result = await client.database
      .from("operational_alerts")
      .select(INBOX_SELECTS.operationalAlerts)
      .eq("status", "open")
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (result.error || !result.data) return [];
    const rows = mapRows<OperationalAlertRow>(result.data);
    return rows.map((row) => {
      const human = humanizeOpsBody(row.kind, row.payload);
      const summary =
        human ??
        (typeof row.payload?.summary === "string"
          ? row.payload.summary
          : `${row.kind} · ${row.severity}`);
      const shortBy =
        !human && typeof row.payload?.shortBy === "number"
          ? ` Short by ${row.payload.shortBy}.`
          : "";
      const body = human ? human : `${summary}.${shortBy}`.trim();
      return {
        id: `ops:${row.id}`,
        kind: `ops_${row.kind}`,
        title: OPS_KIND_TITLE[row.kind] ?? `Operational · ${row.kind}`,
        body,
        docType: null,
        docId: null,
        readAt: null,
        createdAt: row.lastSeenAt || row.createdAt,
        rowVersion: null,
      };
    });
  } catch {
    return [];
  }
}

export async function getInboxNotification(
  id: string,
): Promise<InboxNotification | null> {
  const client = await getReadClient();
  const result = await client.database
    .from("notifications")
    .select(INBOX_SELECTS.notifications)
    .eq("id", id)
    .maybeSingle();
  const row = mapOne<NotificationRow>(maybeOne(result, "notification"));
  if (!row) return null;
  if (!row.docType || !row.docId) return { ...row, rowVersion: null };
  const versions = await lookupDocRowVersions([
    { docType: row.docType, docId: row.docId },
  ]);
  return {
    ...row,
    rowVersion: versions.get(`${row.docType}:${row.docId}`) ?? null,
  };
}
