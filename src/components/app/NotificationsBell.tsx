"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { listQueuedActions, type QueuedActionRecord } from "@/lib/api/ai";
import type { InboxNotification } from "@/lib/api/inbox";
import type { AuditEvent } from "@/types";
import { markInboxNotificationReadAction } from "@/lib/actions/period-close";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * NotificationsBell — top-bar dropdown grouping recent activity.
 * Sections:
 *   1. Inbox       — live notifications (passed from AppTopBar)
 *   2. Bot-proposed — actions queued by the AI co-pilot Auto mode
 *   3. Recent audit — last 6 audit events across all docs
 */

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

export function NotificationsBell({
  initialNotifications = [],
  initialAudit = [],
}: {
  initialNotifications?: InboxNotification[];
  initialAudit?: AuditEvent[];
}) {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? "en";
  const writeLocale = locale === "ar" ? "ar" : "en";
  const [open, setOpen] = React.useState(false);
  const [queued, setQueued] = React.useState<QueuedActionRecord[]>([]);
  const [marking, setMarking] = React.useState(false);
  const [localReadIds, setLocalReadIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  React.useEffect(() => {
    listQueuedActions()
      .then(setQueued)
      .catch(() => {
        /* AI service unavailable — empty list */
      });
  }, [open]);

  const inboxItems = initialNotifications.slice(0, 6);
  const recentAudit = [...initialAudit]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  const unreadInbox = inboxItems.filter(
    (i) => !i.readAt && !localReadIds.has(i.id),
  ).length;
  const unreadQueued = queued.length;
  const unread = unreadInbox + unreadQueued;

  const markAllRead = () => {
    const unreadIds = inboxItems
      .filter((i) => !i.readAt && !localReadIds.has(i.id))
      .map((i) => i.id);
    if (unreadIds.length === 0) return;

    setMarking(true);
    setLocalReadIds((prev) => new Set([...prev, ...unreadIds]));
    void (async () => {
      try {
        await Promise.all(
          unreadIds.map((notificationId) =>
            markInboxNotificationReadAction({
              locale: writeLocale,
              idempotencyKey: crypto.randomUUID(),
              notificationId,
            }),
          ),
        );
        router.refresh();
      } finally {
        setMarking(false);
      }
    })();
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell />
          {unread > 0 ? (
            <span className="bg-primary text-primary-foreground absolute end-0.5 top-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadInbox > 0 ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={marking}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />

        <ScrollArea className="max-h-[60vh]">
          <Section title={`Inbox (${inboxItems.length})`}>
            {inboxItems.length === 0 ? (
              <EmptyRow>All caught up.</EmptyRow>
            ) : (
              inboxItems.map((i) => (
                <Row
                  key={i.id}
                  title={i.title}
                  subtitle={`${i.kind} · ${new Date(i.createdAt).toLocaleString()}`}
                  tone={
                    !i.readAt && !localReadIds.has(i.id) ? "warning" : "muted"
                  }
                  onClick={() => go(`/${locale}/inbox`)}
                />
              ))
            )}
          </Section>

          <Section title={`Bot-proposed (${queued.length})`}>
            {queued.length === 0 ? (
              <EmptyRow>No queued actions yet.</EmptyRow>
            ) : (
              queued.slice(0, 6).map((q) => (
                <Row
                  key={q.id}
                  title={q.label}
                  subtitle={`bot-proposed · ${new Date(q.queuedAt).toLocaleString()}`}
                  tone="warning"
                  onClick={() => go(`/${locale}/inbox`)}
                />
              ))
            )}
          </Section>

          <Section title="Recent audit">
            {recentAudit.length === 0 ? (
              <EmptyRow>No audit events.</EmptyRow>
            ) : (
              recentAudit.map((e) => {
                const hrefFn = DOC_HREF[e.docType];
                const subtitle = `${e.docType} · ${e.fromState ?? "—"} → ${e.toState} · ${new Date(e.at).toLocaleDateString()}`;
                return (
                  <Row
                    key={`${e.docId}_${e.at}`}
                    title={`${e.docType.toUpperCase()} ${e.docId}`}
                    subtitle={subtitle}
                    tone="muted"
                    onClick={() => hrefFn && go(hrefFn(locale, e.docId))}
                  />
                );
              })
            )}
          </Section>
        </ScrollArea>

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => go(`/${locale}/inbox`)}
          >
            Open full inbox
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="bg-muted/50 text-muted-foreground px-3 py-1.5 text-[10px] font-semibold tracking-wide uppercase">
        {title}
      </div>
      <div className="divide-border divide-y">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground px-3 py-3 text-xs">{children}</div>;
}

function Row({
  title,
  subtitle,
  tone,
  onClick,
}: {
  title: string;
  subtitle: string;
  tone: "danger" | "warning" | "muted";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent focus-visible:ring-ring flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          tone === "danger" && "bg-status-danger-foreground",
          tone === "warning" && "bg-status-pending-foreground",
          tone === "muted" && "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{title}</div>
        <div className="text-muted-foreground truncate text-xs">{subtitle}</div>
      </div>
    </button>
  );
}
