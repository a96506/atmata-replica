"use client";

import * as React from "react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { DemoUpload } from "./demo-upload";
import type { DocumentJob } from "@/lib/demo-data";
import { ManualInvoiceModal } from "./manual-invoice-modal";

/** Mapping from OCR job_id → seeded Vendor Bill id (F7 deep-link). */
const OCR_JOB_TO_BILL_ID: Record<number, string | null> = {
  9001: "bill_2",
  9002: "bill_1",
};const STATUS_BADGE: Record<string, string> = {
  queued: "bg-muted text-foreground",
  processing: "bg-status-info-muted text-status-info-foreground",
  completed: "bg-status-success-muted text-status-success-foreground",
  review_needed: "bg-status-pending-muted text-status-pending-foreground",
  extracted: "bg-status-info-muted text-status-info-foreground",
  approved: "bg-status-success-muted text-status-success-foreground",
  failed: "bg-status-danger-muted text-destructive",
};

const COLUMNS = [
  { key: "file", label: "File" },
  { key: "vendor", label: "Vendor" },
  { key: "total", label: "Total" },
  { key: "confidence", label: "Confidence" },
  { key: "status", label: "Status" },
  { key: "actions", label: "", className: "text-right" },
];

export function InvoicesClient({ initialInvoices }: { initialInvoices: DocumentJob[] }) {
  const t = useTranslations("accounting.manual");
  const locale = useLocale();
  const [docs, setDocs] = React.useState<DocumentJob[]>(initialInvoices);
  const [modalOpen, setModalOpen] = React.useState(false);

  const rows = docs.map((doc) => {
    const isManual = doc.file_name.startsWith("Manual ·");
    const linkedBillId = doc.matched_doc_id ?? OCR_JOB_TO_BILL_ID[doc.job_id] ?? null;
    return [
      <span key="f" className="font-medium text-foreground">
        {doc.file_name}
      </span>,
      doc.extraction?.vendor || doc.matched_vendor_name || "—",
      doc.extraction ? `${doc.extraction.currency || "KWD"} ${doc.extraction.total.toFixed(3)}` : "—",
      doc.confidence > 0 ? (
        <span
          className={`text-xs font-medium ${doc.confidence >= 0.9 ? "text-status-success-foreground" : doc.confidence >= 0.7 ? "text-status-pending-foreground" : "text-destructive"}`}
        >
          {(doc.confidence * 100).toFixed(0)}%
        </span>
      ) : (
        "—"
      ),
      <span
        key="s"
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status] ?? "bg-muted text-foreground"}`}
      >
        {doc.status}
      </span>,
      isManual ? (
        <span key="a" className="text-xs text-muted-foreground">
          —
        </span>
      ) : (
        <span key="a" className="flex items-center justify-end gap-2 text-xs">
          <Link
            href={`/accounting/invoices/${doc.job_id}`}
            className="font-medium text-primary hover:underline"
          >
            Review
          </Link>
          {linkedBillId ? (
            <NextLink
              href={`/${locale}/purchasing/bills/${linkedBillId}`}
              className="rounded bg-status-success-muted px-2 py-0.5 font-medium text-status-success-foreground hover:bg-status-success/90"
            >
              → Bill
            </NextLink>
          ) : null}
        </span>
      ),
    ];
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
          <p className="text-sm text-foreground">Upload PDFs for AI extraction, then review and approve.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
        >
          {t("newInvoice")}
        </button>
      </header>

      <DemoUpload />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        emptyMessage="No invoices yet. Upload a PDF to get started."
      />

      <ManualInvoiceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={(doc) => setDocs((prev) => [doc, ...prev])}
      />
    </div>
  );
}
