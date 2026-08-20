import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  getOcrApproveReadiness,
  getOcrJob,
} from "@/lib/actions/invoices";
import { parseOcrExtraction } from "@/lib/ocr/vendor-bill-extraction";
import { InvoiceActions } from "./invoice-actions";

function confidenceColor(v: number) {
  if (v >= 0.9) return "text-status-success-foreground bg-status-success-muted";
  if (v >= 0.7) return "text-status-pending-foreground bg-status-pending-muted";
  return "text-destructive bg-status-danger-muted";
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) notFound();

  const job = await getOcrJob(jobId);
  if (!job) notFound();

  const ext = parseOcrExtraction(job.extraction);
  const readiness = await getOcrApproveReadiness(job);
  const canReject =
    !job.matchedDocId &&
    (job.status === "completed" || job.status === "review_needed");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/accounting/invoices" className="text-sm text-foreground hover:underline">
            &larr; Invoices
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{job.fileName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                job.status === "completed"
                  ? "bg-status-success-muted text-status-success-foreground"
                  : job.status === "review_needed"
                    ? "bg-status-pending-muted text-status-pending-foreground"
                    : job.status === "failed"
                      ? "bg-status-danger-muted text-destructive"
                      : "bg-muted text-foreground"
              }`}
            >
              {job.status}
            </span>
            {job.confidence != null && job.confidence > 0 && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceColor(job.confidence)}`}
              >
                Overall {(job.confidence * 100).toFixed(0)}%
              </span>
            )}
            {readiness.supplierName ? (
              <span className="text-xs text-muted-foreground">
                Supplier: {readiness.supplierName}
              </span>
            ) : null}
          </div>
        </div>

        <InvoiceActions
          jobId={job.id}
          canApprove={readiness.canApprove}
          canReject={canReject}
          blockedReason={readiness.blockedReason}
          alreadyLinkedBillId={job.matchedDocId}
        />
      </header>

      {job.error && (
        <div className="rounded-md bg-status-danger-muted p-4 text-sm text-destructive">
          {job.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-foreground">Extracted fields</h2>
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Vendor", ext.vendor],
                ["VAT", ext.vendorVat],
                ["Invoice #", ext.invoiceNumber],
                ["Date", ext.invoiceDate],
                ["Due date", ext.dueDate],
                ["Currency", ext.currency],
                ["Subtotal", ext.subtotal ? ext.subtotal.toFixed(3) : "—"],
                ["Tax", ext.taxAmount ? ext.taxAmount.toFixed(3) : "—"],
                ["Total", ext.total ? ext.total.toFixed(3) : "—"],
                ["PO ref", ext.poReference],
                ["Payment terms", ext.paymentTerms],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium text-foreground">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-foreground">Field confidence</h2>
          {Object.keys(ext.fieldConfidences).length === 0 ? (
            <p className="text-sm text-muted-foreground">No confidence scores.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {Object.entries(ext.fieldConfidences).map(([field, conf]) => (
                <div key={field} className="flex items-center justify-between">
                  <dt className="text-foreground">{field}</dt>
                  <dd className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceColor(conf)}`}>
                    {(conf * 100).toFixed(0)}%
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {ext.lineItems.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-foreground">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ext.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{li.description}</td>
                    <td className="px-3 py-2 text-foreground">{li.productCode || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.unitPrice.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {li.total.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ext.vendor ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-2 font-semibold text-foreground">Matching</h2>
          <p className="text-sm text-foreground">
            Extracted vendor: <span className="font-medium">{ext.vendor}</span>
            {readiness.supplierName ? (
              <>
                {" "}
                → matched <span className="font-medium">{readiness.supplierName}</span>
              </>
            ) : null}
          </p>
          {job.matchedDocId ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Linked bill id: {job.matchedDocId}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
