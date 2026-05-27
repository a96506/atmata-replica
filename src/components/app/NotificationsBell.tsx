"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { DEMO_INBOX } from "@/lib/demo-data";
import { AUDIT_EVENTS } from "@/mocks/seed/audit";
import { listQueuedActions, type QueuedActionRecord } from "@/lib/api/ai";

/**
 * NotificationsBell — top-bar dropdown grouping recent activity.
 * Sections:
 *   1. Inbox       — unresolved alerts from DEMO_INBOX
 *   2. Bot-proposed — actions queued by the AI co-pilot Auto mode
 *   3. Recent audit — last 6 audit events across all docs
 *
 * Unread count = inbox + bot-proposed (audit isn't unread per se).
 * "Mark all read" stamps the current ISO timestamp in sessionStorage.
 */

const LAST_SEEN_KEY = "atmata.notifications.lastSeen";

const DOC_HREF: Record<string, (locale: string, id: string) => string> = {
  pr: (l, id) => `/${l}/purchasing/purchase-requisitions/${id}`,
  rfq: (l, id) => `/${l}/purchasing/rfqs/${id}`,
  po: (l, id) => `/${l}/purchasing/purchase-orders/${id}`,
  grn: (l, id) => `/${l}/purchasing/goods-receipts/${id}`,
  vendor_bill: (l, id) => `/${l}/purchasing/bills/${id}`,
  vendor_payment: (l, id) => `/${l}/purchasing/payments/${id}`,
  vendor_return: (l, id) => `/${l}/purchasing/vendor-returns/${id}`,
  debit_note: (l, id) => `/${l}/purchasing/debit-notes/${id}`,
  quote: (l, id) => `/${l}/sales/quotes/${id}`,
  so: (l, id) => `/${l}/sales/orders/${id}`,
  dn: (l, id) => `/${l}/sales/deliveries/${id}`,
  customer_invoice: (l, id) => `/${l}/sales/invoices/${id}`,
  customer_receipt: (l, id) => `/${l}/sales/receipts/${id}`,
  customer_return: (l, id) => `/${l}/sales/returns/${id}`,
  credit_note: (l, id) => `/${l}/sales/credit-notes/${id}`,
  journal_entry: (l, id) => `/${l}/accounting/journal-entries/${id}`,
};

export function NotificationsBell() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? "en";
  const [open, setOpen] = React.useState(false);
  const [lastSeen, setLastSeen] = React.useState<string>("");
  const [queued, setQueued] = React.useState<QueuedActionRecord[]>([]);

  React.useEffect(() => {
    try {
      setLastSeen(window.sessionStorage.getItem(LAST_SEEN_KEY) ?? "");
    } catch {
      /* ignore */
    }
    setQueued(listQueuedActions());
  }, [open]);

  const inboxItems = DEMO_INBOX.items.slice(0, 6);
  const recentAudit = [...AUDIT_EVENTS]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  const unreadInbox = inboxItems.filter((i) => !lastSeen || i.created_at > lastSeen).length;
  const unreadQueued = queued.filter((q) => !lastSeen || q.queuedAt > lastSeen).length;
  const unread = unreadInbox + unreadQueued;

  const markAllRead = () => {
    const now = new Date().toISOString();
    try {
      window.sessionStorage.setItem(LAST_SEEN_KEY, now);
    } catch {
      /* ignore */
    }
    setLastSeen(now);
    // eslint-disable-next-line no-console
    console.info("atmata:event", "notifications.markAllRead");
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative cursor-pointer rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <span aria-hidden className="text-lg">🔔</span>
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-orange-500 px-1.5 text-[10px] font-medium text-white">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="text-sm font-semibold text-slate-900">Notifications</div>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="cursor-pointer text-xs text-orange-600 hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
            </header>

            <div className="max-h-[60vh] overflow-y-auto">
              <Section title={`Inbox (${inboxItems.length})`}>
                {inboxItems.length === 0 ? (
                  <Empty>All caught up.</Empty>
                ) : (
                  inboxItems.map((i) => (
                    <Row
                      key={i.id}
                      title={i.title}
                      subtitle={`${i.source} · ${new Date(i.created_at).toLocaleString()}`}
                      tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "slate"}
                      onClick={() => go(`/${locale}/inbox`)}
                    />
                  ))
                )}
              </Section>

              <Section title={`Bot-proposed (${queued.length})`}>
                {queued.length === 0 ? (
                  <Empty>No queued actions yet.</Empty>
                ) : (
                  queued.slice(0, 6).map((q) => (
                    <Row
                      key={q.id}
                      title={q.label}
                      subtitle={`bot-proposed · ${new Date(q.queuedAt).toLocaleString()}`}
                      tone="amber"
                      onClick={() => go(`/${locale}/inbox`)}
                    />
                  ))
                )}
              </Section>

              <Section title="Recent audit">
                {recentAudit.length === 0 ? (
                  <Empty>No audit events.</Empty>
                ) : (
                  recentAudit.map((e) => {
                    const hrefFn = DOC_HREF[e.docType];
                    const subtitle = `${e.docType} · ${e.fromState ?? "—"} → ${e.toState} · ${new Date(e.at).toLocaleDateString()}`;
                    return (
                      <Row
                        key={`${e.docId}_${e.at}`}
                        title={`${e.docType.toUpperCase()} ${e.docId}`}
                        subtitle={subtitle}
                        tone="slate"
                        onClick={() => hrefFn && go(hrefFn(locale, e.docId))}
                      />
                    );
                  })
                )}
              </Section>
            </div>

            <footer className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => go(`/${locale}/inbox`)}
                className="cursor-pointer text-xs font-medium text-orange-600 hover:underline"
              >
                Open full inbox →
              </button>
            </footer>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-3 text-xs text-slate-500">{children}</div>;
}

function Row({
  title,
  subtitle,
  tone,
  onClick,
}: {
  title: string;
  subtitle: string;
  tone: "red" | "amber" | "slate";
  onClick: () => void;
}) {
  const dot =
    tone === "red"
      ? "bg-red-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-900">{title}</div>
        <div className="truncate text-xs text-slate-500">{subtitle}</div>
      </div>
    </button>
  );
}
