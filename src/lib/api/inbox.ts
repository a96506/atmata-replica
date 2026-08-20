import { getReadClient, mapOne, mapRows, maybeOne, requireData } from "@/lib/db/read";
import { INBOX_SELECTS } from "@/lib/db/selects";

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

const DOC_PATH_BY_TYPE: Record<string, (id: string) => string> = {
  pr: (id) => `/purchasing/purchase-requisitions/${id}`,
  rfq: (id) => `/purchasing/rfqs/${id}`,
  po: (id) => `/purchasing/purchase-orders/${id}`,
  grn: (id) => `/purchasing/goods-receipts/${id}`,
  vendor_bill: (id) => `/purchasing/bills/${id}`,
  vendor_payment: (id) => `/purchasing/payments/${id}`,
  vendor_return: (id) => `/purchasing/vendor-returns/${id}`,
  debit_note: (id) => `/purchasing/debit-notes/${id}`,
  quote: (id) => `/sales/quotes/${id}`,
  so: (id) => `/sales/orders/${id}`,
  dn: (id) => `/sales/deliveries/${id}`,
  customer_invoice: (id) => `/sales/invoices/${id}`,
  customer_receipt: (id) => `/sales/receipts/${id}`,
  customer_return: (id) => `/sales/returns/${id}`,
  credit_note: (id) => `/sales/credit-notes/${id}`,
  journal_entry: (id) => `/accounting/journal-entries/${id}`,
  stock_adjustment: (id) => `/inventory/adjustments/${id}`,
  internal_transfer: (id) => `/inventory/transfers/${id}`,
};

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

export function inboxDocPath(
  docType: string | null | undefined,
  docId: string | null | undefined,
): string | null {
  if (!docType || !docId) return null;
  const build = DOC_PATH_BY_TYPE[docType];
  return build ? build(docId) : null;
}

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

  return rows.map((row) => {
    const key =
      row.docType && row.docId ? `${row.docType}:${row.docId}` : null;
    return {
      ...row,
      rowVersion: key ? (versions.get(key) ?? null) : null,
    };
  });
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
