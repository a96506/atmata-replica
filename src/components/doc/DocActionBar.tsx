"use client";

import * as React from "react";
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
    <div className="flex flex-col gap-3">
      {/* Row 1: current state + the available transitions, side by side. The
          demo notice moved to the app shell, so this bar leads with substance
          instead of three stacked informational banners. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Current state</span>
          <StateBadge state={effectiveState} />
        </div>

        <div className="ms-auto">
          <ActionBar
            actions={actions}
            onAction={handle}
            disabled={!!blockedReason || periodBlocked}
            resolveLabel={(a) => ACTION_LABEL[a.id] ?? a.id}
          />
        </div>
      </div>

      {/* Row 2: only genuinely blocking conditions get a banner. */}
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

      {ephemeralState ? (
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">Demo state advance:</span>{" "}
          {ephemeralHistory.map((h, i) => (
            <span key={i}>
              {i > 0 ? " → " : ""}
              <span className="font-mono">{h.from}</span> →{" "}
              <span className="font-mono">{h.to}</span>
            </span>
          ))}
          {" · "}refresh resets.
        </p>
      ) : null}
    </div>
  );
}
