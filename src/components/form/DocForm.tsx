"use client";

import type { ReactNode } from "react";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { ValidationSummary, type ValidationError } from "./ValidationSummary";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type DocFormProps = {
  title: string;
  subtitle?: string;
  header: ReactNode;
  lines?: ReactNode;
  totals?: ReactNode;
  attachments?: ReactNode;
  notes?: ReactNode;
  approvalPreview?: ReactNode;
  errors: ValidationError[];
  dirty: boolean;
  onSubmit: () => void;
  onSaveDraft?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  saveDraftLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  /** Disables footer actions while a server write is in flight. */
  pending?: boolean;
  banner?: ReactNode;
};

/**
 * Shell for every document creation/edit screen: section cards in a fixed
 * order, with a sticky footer so the submit action stays reachable on long
 * forms instead of requiring a scroll to the bottom.
 */
export function DocForm({
  title,
  subtitle,
  header,
  lines,
  totals,
  attachments,
  notes,
  approvalPreview,
  errors,
  dirty,
  onSubmit,
  onSaveDraft,
  onCancel,
  submitLabel = "Submit",
  saveDraftLabel = "Save as draft",
  cancelLabel = "Cancel",
  submitDisabled,
  pending = false,
  banner,
}: DocFormProps) {
  const actionsDisabled = Boolean(submitDisabled) || pending;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <UnsavedChangesGuard dirty={dirty} />

      <PageHeader title={title} description={subtitle} />

      {banner}

      <ValidationSummary errors={errors} />

      <FormSection title="Header">{header}</FormSection>
      {lines ? <FormSection title="Lines">{lines}</FormSection> : null}
      {totals ? <FormSection title="Totals">{totals}</FormSection> : null}
      {attachments ? (
        <FormSection title="Attachments">{attachments}</FormSection>
      ) : null}
      {notes ? <FormSection title="Notes">{notes}</FormSection> : null}

      {approvalPreview}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
        ) : null}
        {onSaveDraft ? (
          <Button
            type="button"
            variant="outline"
            onClick={onSaveDraft}
            disabled={pending}
          >
            {saveDraftLabel}
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={actionsDisabled}
          title={
            pending
              ? "Saving…"
              : submitDisabled
                ? "Resolve validation errors first"
                : undefined
          }
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
