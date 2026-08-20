"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  approveOcrJobAction,
  rejectOcrJobAction,
} from "@/lib/actions/invoices";

function actionErrorMessage(error: {
  messageKey?: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
}): string {
  const field = error.fieldErrors
    ? Object.values(error.fieldErrors).flat()[0]
    : undefined;
  return field ?? error.messageKey ?? error.code;
}

export function InvoiceActions({
  jobId,
  canApprove,
  canReject,
  blockedReason,
  alreadyLinkedBillId,
}: {
  jobId: number;
  canApprove: boolean;
  canReject: boolean;
  blockedReason: string | null;
  alreadyLinkedBillId: string | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(
    null,
  );

  const onApprove = async () => {
    if (pending || !canApprove) {
      if (blockedReason) toast.error(blockedReason);
      return;
    }
    setPending("approve");
    try {
      const result = await approveOcrJobAction({
        locale: locale === "ar" ? "ar" : "en",
        jobId,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (!result.ok) {
        toast.error(actionErrorMessage(result.error));
        idempotencyKeyRef.current = crypto.randomUUID();
        return;
      }
      toast.success(`Draft bill ${result.data.number} created`);
      idempotencyKeyRef.current = crypto.randomUUID();
      router.push(`/${locale}/purchasing/bills/${result.data.id}`);
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  const onReject = async () => {
    if (pending || !canReject) return;
    setPending("reject");
    try {
      const result = await rejectOcrJobAction({
        locale: locale === "ar" ? "ar" : "en",
        jobId,
        idempotencyKey: idempotencyKeyRef.current,
        reason: "REJECTED",
      });
      if (!result.ok) {
        toast.error(actionErrorMessage(result.error));
        idempotencyKeyRef.current = crypto.randomUUID();
        return;
      }
      toast.message(`Invoice #${jobId} rejected`);
      idempotencyKeyRef.current = crypto.randomUUID();
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  if (alreadyLinkedBillId) {
    return (
      <a
        href={`/${locale}/purchasing/bills/${alreadyLinkedBillId}`}
        className="rounded-md bg-status-success-muted px-4 py-2 text-sm font-medium text-status-success-foreground ring-1 ring-status-success-border hover:bg-status-success/20"
      >
        Open vendor bill
      </a>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending !== null || !canApprove}
          title={canApprove ? undefined : (blockedReason ?? undefined)}
          className="cursor-pointer rounded-md bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-4 py-2 text-sm font-medium transition-colors hover:bg-status-success/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void onApprove()}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending !== null || !canReject}
          className="cursor-pointer rounded-md bg-destructive px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void onReject()}
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {!canApprove && blockedReason ? (
        <p className="max-w-sm text-right text-xs text-muted-foreground">
          {blockedReason}
        </p>
      ) : null}
    </div>
  );
}
