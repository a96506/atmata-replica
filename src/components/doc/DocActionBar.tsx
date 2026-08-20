"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { AlertCircle } from "lucide-react";
import { ActionBar } from "@/components/doc/ActionBar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  PeriodLockBanner,
  PostedWatermarkBanner,
} from "@/components/banners";
import { StateBadge } from "@/components/doc/StateBadge";
import { useSession } from "@/lib/session";
import { legalActions, type Action } from "@/lib/state-machines";
import { periodStatusFor } from "@/lib/period";
import {
  postDocumentAction,
  reverseDocumentAction,
  transitionDocumentAction,
} from "@/lib/actions/documents";
import type { DocState, DocType } from "@/types";

const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  approve: "Approve",
  reject: "Reject",
  post: "Post",
  cancel: "Cancel",
  reverse: "Reverse",
  close: "Close",
  send: "Send",
  record_quotes: "Record quotes",
  award: "Award",
};

const ACTION_PREVIEW: Record<
  string,
  (ctx: { number: string; total?: string; nextState: DocState }) => {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "default" | "destructive";
  }
> = {
  submit: (c) => ({
    title: `Submit ${c.number}?`,
    description: `Moves state from current to "${c.nextState}" and routes for approval. You can still edit by recalling from the approver.`,
    confirmLabel: "Submit",
    tone: "default",
  }),
  approve: (c) => ({
    title: `Approve ${c.number}?`,
    description: `Confirms approval. State moves to "${c.nextState}". The audit log will record your user + timestamp.`,
    confirmLabel: "Approve",
    tone: "default",
  }),
  reject: (c) => ({
    title: `Reject ${c.number}?`,
    description: `Returns the document to "${c.nextState}" so the originator can rework. They will be notified.`,
    confirmLabel: "Reject",
    tone: "destructive",
  }),
  post: (c) => ({
    title: `Post ${c.number}?`,
    description: `${c.total ? `Total ${c.total}. ` : ""}This generates a journal entry, updates linked balances (stock/AR/AP) and freezes the document. Corrections after posting must use a counter-document.`,
    confirmLabel: "Post",
    tone: "default",
  }),
  cancel: (c) => ({
    title: `Cancel ${c.number}?`,
    description: `State moves to "cancelled" and the document is dropped from active work. Linked draft child docs (if any) become orphaned.`,
    confirmLabel: "Cancel document",
    tone: "destructive",
  }),
  reverse: (c) => ({
    title: `Reverse ${c.number}?`,
    description: `Generates a reversing journal entry in the next open period. Underlying balances revert. The original posted doc stays as an audit trail.`,
    confirmLabel: "Reverse",
    tone: "destructive",
  }),
};

export type DocActionBarProps = {
  locale: "en" | "ar";
  docType: DocType;
  docId: string;
  expectedRowVersion: number;
  docNumber: string;
  currentState: DocState;
  totalLabel?: string;
  blockedReason?: string | null;
  /** When provided, surfaces a period banner if the doc date is in a closed period. */
  docDate?: string;
};

function actionErrorMessage(error: {
  messageKey?: string;
  code: string;
}): string {
  return error.messageKey ?? error.code;
}

export function DocActionBar({
  locale,
  docType,
  docId,
  expectedRowVersion,
  docNumber,
  currentState,
  totalLabel,
  blockedReason,
  docDate,
}: DocActionBarProps) {
  const router = useRouter();
  const { role } = useSession();
  const confirm = useConfirm();
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);
  const [rowVersion, setRowVersion] = React.useState(expectedRowVersion);

  React.useEffect(() => {
    setRowVersion(expectedRowVersion);
  }, [expectedRowVersion]);

  const actions = legalActions(docType, currentState, role);
  const periodStatus = periodStatusFor(docDate);
  const periodBlocked =
    periodStatus === "hard_closed" ||
    (periodStatus === "soft_closed" &&
      role !== "admin" &&
      role !== "period_adjust");

  const handle = React.useCallback(
    async (a: Action) => {
      if (pending) return;
      if (blockedReason) {
        toast.error(`Blocked: ${blockedReason}`);
        return;
      }
      const preview = ACTION_PREVIEW[a.id]?.({
        number: docNumber,
        total: totalLabel,
        nextState: a.toState,
      });
      if (!preview) {
        toast.message(`${a.id} · would move to ${a.toState}`);
        return;
      }
      const ok = await confirm({
        title: preview.title,
        description: preview.description,
        confirmLabel: preview.confirmLabel,
        cancelLabel: "Keep as-is",
        tone: preview.tone,
      });
      if (!ok) return;

      setPending(true);
      try {
        const base = {
          locale,
          docType,
          docId,
          expectedRowVersion: rowVersion,
          idempotencyKey: idempotencyKeyRef.current,
        };

        let result;
        if (a.id === "post") {
          result = await postDocumentAction(base);
        } else if (a.id === "reverse") {
          result = await reverseDocumentAction(base);
        } else {
          result = await transitionDocumentAction({
            ...base,
            action: a.id as
              | "submit"
              | "approve"
              | "reject"
              | "cancel"
              | "send"
              | "record_quotes"
              | "award"
              | "close",
          });
        }

        if (!result.ok) {
          if (result.error.currentRowVersion != null) {
            setRowVersion(result.error.currentRowVersion);
          }
          if (result.error.code === "ILLEGAL_TRANSITION") {
            router.refresh();
          }
          toast.error(actionErrorMessage(result.error));
          return;
        }

        idempotencyKeyRef.current = crypto.randomUUID();
        if (result.data.rowVersion != null) {
          setRowVersion(result.data.rowVersion);
        }

        const label = ACTION_LABEL[a.id] ?? a.id;
        if (result.data.state === "pending" && a.id === "submit") {
          toast.success(`Submitted for approval · ${docNumber}`);
        } else if (a.id === "post" && result.data.state !== "posted") {
          toast.success(
            `${label} · ${docNumber} → ${result.data.state}`,
          );
        } else {
          toast.success(
            `${label} · ${docNumber} → ${result.data.state}`,
          );
        }
        router.refresh();
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      blockedReason,
      confirm,
      docNumber,
      totalLabel,
      locale,
      docType,
      docId,
      rowVersion,
      router,
    ],
  );

  const posted =
    currentState === "posted" ||
    currentState === "locked" ||
    currentState === "archived";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Current state</span>
          <StateBadge state={currentState} />
        </div>

        <div className="ms-auto">
          <ActionBar
            actions={actions}
            onAction={handle}
            disabled={!!blockedReason || periodBlocked || pending}
            resolveLabel={(a) => ACTION_LABEL[a.id] ?? a.id}
          />
        </div>
      </div>

      {blockedReason ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Blocked</AlertTitle>
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : null}

      {posted ? <PostedWatermarkBanner /> : null}

      {!posted &&
      docDate &&
      (periodStatus === "hard_closed" || periodStatus === "soft_closed") ? (
        <PeriodLockBanner status={periodStatus} date={docDate} />
      ) : null}
    </div>
  );
}
