"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { DemoUpload } from "./demo-upload";
import type { DocumentJob } from "@/lib/demo-data";
import { ManualInvoiceModal } from "./manual-invoice-modal";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-muted text-foreground",
  processing: "bg-status-info-muted text-status-info-foreground",
  completed: "bg-status-success-muted text-status-success-foreground",
  review_needed: "bg-status-pending-muted text-status-pending-foreground",
  extracted: "bg-status-info-muted text-status-info-foreground",
  approved: "bg-status-success-muted text-status-success-foreground",
  failed: "bg-status-danger-muted text-destructive",
};

export function InvoicesClient({ initialInvoices }: { initialInvoices: DocumentJob[] }) {
  const t = useTranslations("accounting.manual");
  const tPage = useTranslations("accounting.invoicesPage");
  const [docs] = React.useState<DocumentJob[]>(initialInvoices);
  const [modalOpen, setModalOpen] = React.useState(false);
  const showManualModal = process.env.NODE_ENV === "development";

  const columns = [
    { key: "file", label: tPage("colFile") },
    { key: "vendor", label: tPage("colVendor") },
    { key: "total", label: tPage("colTotal") },
    { key: "confidence", label: tPage("colConfidence") },
    { key: "status", label: tPage("colStatus") },
    { key: "actions", label: "", className: "text-right" },
  ];

  const rows = docs.map((doc) => {
    const isManual = doc.file_name.startsWith("Manual ·");
    const linkedBillId = doc.matched_doc_id ?? null;
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
            href={`/accounting/invoices/${doc.public_id}`}
            className="font-medium text-primary hover:underline"
          >
            {tPage("review")}
          </Link>
          {linkedBillId ? (
            <Link
              href={`/purchasing/bills/${linkedBillId}`}
              className="rounded bg-status-success-muted px-2 py-0.5 font-medium text-status-success-foreground hover:bg-status-success/90"
            >
              {tPage("toBill")}
            </Link>
          ) : null}
        </span>
      ),
    ];
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{tPage("title")}</h1>
          <p className="text-sm text-foreground">{tPage("subtitle")}</p>
        </div>
        {showManualModal ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
          >
            {t("newInvoice")}
          </button>
        ) : null}
      </header>

      <DemoUpload />

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage={tPage("empty")}
      />

      {showManualModal ? (
        <ManualInvoiceModal open={modalOpen} onOpenChange={setModalOpen} />
      ) : null}
    </div>
  );
}
