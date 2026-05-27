"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { ActionBar } from "@/components/doc/ActionBar";
import {
  DemoModeBanner,
  PeriodLockBanner,
  PostedWatermarkBanner,
} from "@/components/banners";
import { StateBadge } from "@/components/doc/StateBadge";
import { useSession } from "@/lib/session";
import { legalActions, type Action } from "@/lib/state-machines";
import { FISCAL_PERIODS } from "@/mocks/seed/master";
import type { DocState, DocType, PeriodStatus } from "@/types";

function periodFor(date: string | undefined): PeriodStatus {
  if (!date) return "no_period";
  const ts = new Date(date).getTime();
  for (const p of FISCAL_PERIODS) {
    if (ts >= new Date(p.start).getTime() && ts <= new Date(p.end).getTime()) {
      return p.status;
    }
  }
  return "no_period";
}

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
  docType: DocType;
  docNumber: string;
  currentState: DocState;
  totalLabel?: string;
  blockedReason?: string | null;
  /** When provided, surfaces a period banner if the doc date is in a closed period. */
  docDate?: string;
};

export function DocActionBar({
  docType,
  docNumber,
  currentState,
  totalLabel,
  blockedReason,
  docDate,
}: DocActionBarProps) {
  const { role } = useSession();
  const confirm = useConfirm();
  const [ephemeralState, setEphemeralState] = React.useState<DocState | null>(null);
  const [ephemeralHistory, setEphemeralHistory] = React.useState<
    { from: DocState; to: DocState; at: string }[]
  >([]);

  const effectiveState = ephemeralState ?? currentState;
  const actions = legalActions(docType, effectiveState, role);
  const periodStatus = periodFor(docDate);
  const periodBlocked =
    periodStatus === "hard_closed" ||
    (periodStatus === "soft_closed" && role !== "admin" && role !== "period_adjust");

  const handle = React.useCallback(
    async (a: Action) => {
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
        toast.message(`${a.id} (demo) · would move to ${a.toState}`);
        return;
      }
      const ok = await confirm({
        title: preview.title,
        description: preview.description + "\n\nDemo · this action will not persist.",
        confirmLabel: preview.confirmLabel,
        cancelLabel: "Keep as-is",
        tone: preview.tone,
      });
      if (!ok) return;
      toast.success(
        `${ACTION_LABEL[a.id] ?? a.id} · ${docNumber} → ${a.toState} (demo)`,
      );
      setEphemeralHistory((prev) => [
        ...prev,
        { from: effectiveState, to: a.toState, at: new Date().toISOString() },
      ]);
      setEphemeralState(a.toState);
    },
    [confirm, docNumber, totalLabel, blockedReason, effectiveState],
  );

  const posted =
    effectiveState === "posted" ||
    effectiveState === "locked" ||
    effectiveState === "archived";

  return (
    <div className="space-y-2">
      {ephemeralState ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">
          <span className="font-medium">Demo state advance:</span>{" "}
          {ephemeralHistory.map((h, i) => (
            <span key={i}>
              {i > 0 ? " → " : ""}
              <span className="font-mono">{h.from}</span> →{" "}
              <span className="font-mono">{h.to}</span>
            </span>
          ))}
          {" · "}refresh resets.
        </div>
      ) : (
        <DemoModeBanner />
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Current state:</span>
        <StateBadge state={effectiveState} />
        {posted ? null : (
          <span className="text-xs text-slate-400">
            {actions.length === 0 ? "No legal actions for your role." : null}
          </span>
        )}
      </div>

      {blockedReason ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          <span className="font-medium">Blocked:</span> {blockedReason}
        </div>
      ) : null}

      {posted ? <PostedWatermarkBanner /> : null}
      {!posted &&
      docDate &&
      (periodStatus === "hard_closed" || periodStatus === "soft_closed") ? (
        <PeriodLockBanner status={periodStatus} date={docDate} />
      ) : null}

      <ActionBar
        actions={actions}
        onAction={handle}
        disabled={!!blockedReason || periodBlocked}
        resolveLabel={(a) => ACTION_LABEL[a.id] ?? a.id}
      />
    </div>
  );
}
