"use client";

import type { ReactNode } from "react";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { ValidationSummary, type ValidationError } from "./ValidationSummary";

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
  banner?: ReactNode;
};

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
  banner,
}: DocFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <UnsavedChangesGuard dirty={dirty} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
      </div>

      {banner}

      <ValidationSummary errors={errors} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Header
        </h2>
        {header}
      </section>

      {lines ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Lines
          </h2>
          {lines}
        </section>
      ) : null}

      {totals ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Totals
          </h2>
          {totals}
        </section>
      ) : null}

      {attachments ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Attachments
          </h2>
          {attachments}
        </section>
      ) : null}

      {notes ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Notes
          </h2>
          {notes}
        </section>
      ) : null}

      {approvalPreview ? <div>{approvalPreview}</div> : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
        ) : null}
        {onSaveDraft ? (
          <button
            type="button"
            onClick={onSaveDraft}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {saveDraftLabel}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitDisabled}
          title={submitDisabled ? "Resolve validation errors first" : undefined}
          className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
