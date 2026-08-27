"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { UnsavedChangesGuard } from "@/components/form/UnsavedChangesGuard";
import {
  ConcurrentEditBanner,
  PostedWatermarkBanner,
} from "@/components/banners";
import { StateBadge } from "@/components/doc/StateBadge";
import { useBreadcrumbDocLabel } from "@/components/app/BreadcrumbOverride";
import {
  reverseDocumentAction,
  updateDocumentHeaderAction,
} from "@/lib/actions/documents";
import type { DocState, DocType } from "@/types";

export type DocEditShellProps = {
  locale: "en" | "ar";
  docType: DocType;
  docId: string;
  expectedRowVersion: number;
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
  locale,
  docType,
  docId,
  expectedRowVersion,
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
  const actionToast = useActionToast();
  const isPosted = POSTED.includes(state);
  // Replace the raw record id in the trailing breadcrumb crumb with the
  // document number (the URL carries the UUID).
  useBreadcrumbDocLabel(docNumber);
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);
  const [rowVersion, setRowVersion] = React.useState(expectedRowVersion);
  const [staleConflict, setStaleConflict] = React.useState(false);

  const [editedDate, setEditedDate] = React.useState(date);
  const [editedNotes, setEditedNotes] = React.useState(notes ?? "");
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setRowVersion(expectedRowVersion);
    setEditedDate(date);
    setEditedNotes(notes ?? "");
    setDirty(false);
    setStaleConflict(false);
  }, [expectedRowVersion, date, notes]);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const onSubmit = async () => {
    if (pending) return;
    const ok = await confirm({
      title: `Save changes to ${docNumber}?`,
      description: "Header edits will be written; lines are unchanged.",
      confirmLabel: "Save",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await updateDocumentHeaderAction({
        locale,
        docType,
        docId,
        expectedRowVersion: rowVersion,
        idempotencyKey: idempotencyKeyRef.current,
        patch: {
          date: editedDate !== date ? editedDate : undefined,
          notes: editedNotes !== (notes ?? "") ? editedNotes : undefined,
        },
      });
      if (!result.ok) {
        if (
          result.error.code === "STALE_VERSION" ||
          result.error.code === "CONFLICT"
        ) {
          setStaleConflict(true);
          if (result.error.currentRowVersion != null) {
            setRowVersion(result.error.currentRowVersion);
          }
        }
        actionToast.error(result.error);
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      setStaleConflict(false);
      toast.success(`Saved · ${docNumber}`);
      router.push(backHref);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
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

  const onReverse = async () => {
    if (pending) return;
    const ok = await confirm({
      title: `Reverse ${docNumber}?`,
      description:
        "Generates a reversing journal entry in the next open period. The original posted doc remains for audit.",
      confirmLabel: "Reverse",
      tone: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await reverseDocumentAction({
        locale,
        docType,
        docId,
        expectedRowVersion: rowVersion,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (!result.ok) {
        if (
          result.error.code === "STALE_VERSION" ||
          result.error.code === "CONFLICT"
        ) {
          setStaleConflict(true);
        }
        actionToast.error(result.error);
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      toast.success(`Reversed · ${docNumber}`);
      router.push(backHref);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
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
        {staleConflict ? (
          <ConcurrentEditBanner
            by="another user"
            at="just now"
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
            disabled={pending}
            onClick={onReverse}
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
          {staleConflict ? (
            <ConcurrentEditBanner
              by="another user"
              at="just now"
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
            <DatePicker
              label="Date"
              value={editedDate}
              onChange={wrap(setEditedDate)}
            />
            <div className="flex items-end">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">
                  Current state:
                </span>
                <StateBadge state={state} />
              </div>
            </div>
          </div>
        </div>
      }
      lines={
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            Line edits are out of scope on the edit page — to change lines,
            cancel this draft and create a new document via the +New flow.
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
      pending={pending}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel={pending ? "Saving…" : "Save"}
    />
  );
}
