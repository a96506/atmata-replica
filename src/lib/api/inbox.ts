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
    return {
      ...row,
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
