"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { UnsavedChangesGuard } from "@/components/form/UnsavedChangesGuard";
import {
  ConcurrentEditBanner,
  PostedWatermarkBanner,
} from "@/components/banners";
import { StateBadge } from "@/components/doc/StateBadge";
import type { DocState } from "@/types";

export type DocEditShellProps = {
  docNumber: string;
  docTitle: string;
  state: DocState;
  date: string;
  notes?: string;
  /** Read-only preview of lines (rendered as `ReactNode`). */
  linesPreview: React.ReactNode;
  /** Where to navigate on cancel/save. */
  backHref: string;
};

const POSTED: DocState[] = ["posted", "locked", "archived"];

export function DocEditShell({
  docNumber,
  docTitle,
  state,
  date,
  notes,
  linesPreview,
  backHref,
}: DocEditShellProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const isPosted = POSTED.includes(state);
  const showConflict = searchParams?.get("demoConflict") === "1";

  const [editedDate, setEditedDate] = React.useState(date);
  const [editedNotes, setEditedNotes] = React.useState(notes ?? "");
  const [dirty, setDirty] = React.useState(false);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const onSubmit = async () => {
    const ok = await confirm({
      title: `Save changes to ${docNumber}?`,
      description: "Header edits will be written; lines are unchanged. Demo · this action will not persist.",
      confirmLabel: "Save",
    });
    if (!ok) return;
    toast.success(`Saved (demo): ${docNumber}`);
    setDirty(false);
    router.push(backHref);
  };

  const onCancel = async () => {
    if (!dirty) {
      router.push(backHref);
      return;
    }
    const ok = await confirm({
      title: "Discard changes?",
      confirmLabel: "Discard",
      tone: "destructive",
    });
    if (ok) {
      setDirty(false);
      router.push(backHref);
    }
  };

  if (isPosted) {
    return (
      <div className="space-y-4">
        <UnsavedChangesGuard dirty={false} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {docNumber}
            </div>
            <h1 className="mt-0.5 text-xl font-semibold text-foreground">
              {docTitle}
            </h1>
          </div>
          <StateBadge state={state} />
        </div>
        <PostedWatermarkBanner />
        <div className="rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Lines (read-only)
          </h2>
          {linesPreview}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button asChild variant="ghost">
            <Link href={backHref}>Back to document</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: `Reverse ${docNumber}?`,
                description:
                  "Generates a reversing journal entry in the next open period. The original posted doc remains for audit. Demo · this action will not persist.",
                confirmLabel: "Reverse",
                tone: "destructive",
              });
              if (ok) toast.success(`Reverse queued (demo) · ${docNumber}`);
            }}
          >
            Reverse
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DocForm
      title={`Edit · ${docNumber}`}
      subtitle={docTitle}
      header={
        <div className="space-y-3">
          {showConflict ? (
            <ConcurrentEditBanner
              by="Khalid (warehouse)"
              at="2 min ago"
              onReload={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  Reload
                </Button>
              }
            />
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <DatePicker label="Date" value={editedDate} onChange={wrap(setEditedDate)} />
            <div className="flex items-end">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">Current state:</span>
                <StateBadge state={state} />
              </div>
            </div>
          </div>
        </div>
      }
      lines={
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            Line edits are out of scope on the edit page — to change lines, cancel
            this draft and create a new document via the +New flow.
          </div>
          {linesPreview}
        </div>
      }
      notes={
        <Textarea
          rows={4}
          value={editedNotes}
          onChange={(e) => wrap(setEditedNotes)(e.target.value)}
          placeholder="Internal notes…"
        />
      }
      errors={[]}
      dirty={dirty}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel="Save"
    />
  );
}
