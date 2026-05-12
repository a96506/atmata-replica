"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { DemoUpload } from "./demo-upload";
import type { DocumentJob } from "@/lib/demo-data";
import { ManualInvoiceModal } from "./manual-invoice-modal";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  review_needed: "bg-amber-100 text-amber-800",
  extracted: "bg-purple-100 text-purple-800",
  approved: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
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
  const [docs, setDocs] = React.useState<DocumentJob[]>(initialInvoices);
  const [modalOpen, setModalOpen] = React.useState(false);

  const rows = docs.map((doc) => {
    const isManual = doc.file_name.startsWith("Manual ·");
    return [
      <span key="f" className="font-medium text-slate-900">
        {doc.file_name}
      </span>,
      doc.extraction?.vendor || doc.matched_vendor_name || "—",
      doc.extraction ? `${doc.extraction.currency || "KWD"} ${doc.extraction.total.toFixed(3)}` : "—",
      doc.confidence > 0 ? (
        <span
          className={`text-xs font-medium ${doc.confidence >= 0.9 ? "text-green-700" : doc.confidence >= 0.7 ? "text-amber-700" : "text-red-700"}`}
        >
          {(doc.confidence * 100).toFixed(0)}%
        </span>
      ) : (
        "—"
      ),
      <span
        key="s"
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status] ?? "bg-slate-100 text-slate-800"}`}
      >
        {doc.status}
      </span>,
      isManual ? (
        <span key="a" className="text-xs text-slate-500">
          —
        </span>
      ) : (
        <Link
          key="a"
          href={`/accounting/invoices/${doc.job_id}`}
          className="text-xs font-medium text-orange-600 hover:underline"
        >
          Review
        </Link>
      ),
    ];
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-700">Upload PDFs for AI extraction, then review and approve.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
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
