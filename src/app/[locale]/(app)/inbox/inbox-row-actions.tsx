"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { transitionDocumentAction } from "@/lib/actions/documents";
import { markInboxNotificationReadAction } from "@/lib/actions/period-close";
import type { TransitionAction } from "@/lib/actions/validation/common";

const APPROVABLE_SOURCES = new Set([
  "audit_log",
  "document_processing",
  "supply_chain_alert",
  "duplicate_group",
  "approval_requested",
]);

const FALLBACK_ROUTES: Record<string, string> = {
  reconciliation: "/accounting/reconciliation",
  credit_hold: "/accounting",
};

export type InboxRowDocContext = {
  docType?: string | null;
  docId?: string | null;
  rowVersion?: number | null;
};

export function InboxRowActions({
  source,
  id,
  sourceUrl,
  notificationId,
  doc,
}: {
  source: string;
  id: number | string;
  sourceUrl?: string | null;
  /** Real notifications.id when available; otherwise mark-read is skipped. */
  notificationId?: string | null;
  doc?: InboxRowDocContext | null;
}) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const [pending, setPending] = React.useState(false);

  const target = sourceUrl ?? FALLBACK_ROUTES[source] ?? null;
  const href = target ? `/${locale}${target}` : null;

  const canTransition =
    Boolean(doc?.docType) &&
    Boolean(doc?.docId) &&
    typeof doc?.rowVersion === "number" &&
    doc.rowVersion > 0;

  const runTransition = async (action: Extract<TransitionAction, "approve" | "reject">) => {
    if (!canTransition || !doc?.docType || !doc.docId || !doc.rowVersion) {
      toast.error(
        "Approve/reject needs docType, docId, and rowVersion on the notification row.",
      );
      return;
    }
    setPending(true);
    try {
      const result = await transitionDocumentAction({
        locale: writeLocale,
        docType: doc.docType,
        docId: doc.docId,
        action,
        expectedRowVersion: doc.rowVersion,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      if (notificationId) {
        await markInboxNotificationReadAction({
          locale: writeLocale,
          idempotencyKey: crypto.randomUUID(),
          notificationId,
        });
      }
      toast.success(action === "approve" ? t("approve") : t("reject"));
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const markRead = async () => {
    if (!notificationId) {
      toast.error("Mark read needs a notification id.");
      return;
    }
    setPending(true);
    try {
      const result = await markInboxNotificationReadAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        notificationId,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      toast.success("Marked read.");
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {APPROVABLE_SOURCES.has(source) && (
          <>
            <Button
              type="button"
              size="sm"
              disabled={pending || !canTransition}
              title={
                !canTransition
                  ? "Document transition unavailable — missing docType/docId/rowVersion"
                  : undefined
              }
              onClick={() => void runTransition("approve")}
            >
              {t("approve")}
            </Button>
            {(source === "audit_log" || source === "approval_requested") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={pending || !canTransition}
                title={
                  !canTransition
                    ? "Document transition unavailable — missing docType/docId/rowVersion"
                    : undefined
                }
                onClick={() => void runTransition("reject")}
              >
                {t("reject")}
              </Button>
            )}
          </>
        )}
        {notificationId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => void markRead()}
          >
            Mark read
          </Button>
        ) : null}
        {href && (
          <Button asChild size="sm" variant="ghost">
            <Link href={href}>{t("openWorkspace")}</Link>
          </Button>
        )}
      </div>
      {APPROVABLE_SOURCES.has(source) && !canTransition ? (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
          Approve disabled until docType, docId, and rowVersion are available.
        </p>
      ) : null}
    </div>
  );
}
