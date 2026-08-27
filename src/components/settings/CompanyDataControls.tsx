"use client";

import * as React from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/export/csv";
import {
  exportCompanyDataAction,
  type CompanyDataExport,
} from "@/lib/actions/data-export";
import { requestAccountDeletionAction } from "@/lib/actions/account-deletion";

/**
 * Data-portability + deletion controls for the company profile page.
 *
 * - "Export company data" fetches the core tables (server action, RLS-scoped)
 *   and downloads them as one CSV per table (no JSZip dependency).
 * - "Close my account / delete my data" opens a confirm dialog, calls the
 *   deletion action, and surfaces the resulting channel ("table" row
 *   recorded vs "operator" fallback when the table is not provisioned).
 */

type AnyRow = Record<string, unknown>;

function columnsFor(rows: AnyRow[]): CsvColumn<AnyRow>[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 200)) {
    for (const k of Object.keys(row)) keys.add(k);
  }
  return [...keys].map((key) => ({
    label: key,
    value: (row) => (row as Record<string, unknown>)[key],
  }));
}

function downloadTable(name: string, rows: AnyRow[]): void {
  if (rows.length === 0) {
    // Still emit an empty CSV with no header so the user sees the file.
    downloadCsv("", `company-${name}`);
    return;
  }
  downloadCsv(toCsv(rows, columnsFor(rows)), `company-${name}`);
}

export function CompanyDataControls({ locale }: { locale: string }) {
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deletionResult, setDeletionResult] = React.useState<
    | { channel: "table" | "operator"; requestId: string; note?: string }
    | null
  >(null);

  const onExport = React.useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportCompanyDataAction();
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const data = result.data as CompanyDataExport;
      // Sequential downloads so the browser doesn't block multiple at once.
      downloadTable("products", data.products as unknown as AnyRow[]);
      downloadTable("customers", data.customers as unknown as AnyRow[]);
      downloadTable("suppliers", data.suppliers as unknown as AnyRow[]);
      downloadTable("invoices", data.invoices as unknown as AnyRow[]);
      downloadTable("bills", data.bills as unknown as AnyRow[]);
      downloadTable("journal-entries", data.journalEntries as unknown as AnyRow[]);
      downloadTable("accounts", data.accounts as unknown as AnyRow[]);
      toast.success("Company data export started (one CSV per table).");
    } catch {
      actionToast.network();
    } finally {
      setExporting(false);
    }
  }, [actionToast]);

  const onDelete = React.useCallback(async () => {
    const ok = await confirm({
      title: "Close your account and delete your data?",
      description:
        "This submits a deletion request to the platform operator. Your data will be reviewed and removed. This cannot be undone.",
      confirmLabel: "Submit request",
      cancelLabel: "Keep account",
      tone: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await requestAccountDeletionAction({
        locale: locale === "ar" ? "ar" : "en",
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      setDeletionResult(result.data);
      if (result.data.channel === "table") {
        toast.success("Deletion request recorded. An operator will be in touch.");
      } else {
        toast.success("Your request was sent to the operator.");
      }
    } catch {
      actionToast.network();
    } finally {
      setDeleting(false);
    }
  }, [confirm, actionToast, locale]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Data &amp; account</h2>
        <p className="text-xs text-muted-foreground">
          Export your company data as CSV, or submit a data-deletion request.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting}
        >
          <Download />
          {exporting ? "Exporting…" : "Export company data"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 />
          {deleting ? "Submitting…" : "Close my account / delete my data"}
        </Button>
      </div>

      {deletionResult ? (
        <div
          role="status"
          className="rounded-md border border-status-info-border bg-status-info-muted p-3 text-xs text-status-info-foreground"
        >
          {deletionResult.channel === "table" ? (
            <p>
              Request recorded (ref <span className="font-mono">{deletionResult.requestId}</span>).
              The platform operator will process your deletion.
            </p>
          ) : (
            <p>
              The <span className="font-mono">deletion_requests</span> table is
              not provisioned yet. Your request was sent to the operator
              (ref <span className="font-mono">{deletionResult.requestId}</span>).
              {deletionResult.note ? ` ${deletionResult.note}` : ""}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
