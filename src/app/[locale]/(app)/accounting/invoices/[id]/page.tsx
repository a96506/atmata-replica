import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DEMO_INVOICE_DETAIL } from "@/lib/demo-data";
import { InvoiceDemoActions } from "./invoice-demo-actions";

function confidenceColor(v: number) {
  if (v >= 0.9) return "text-green-700 bg-green-50";
  if (v >= 0.7) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("common");
  const doc = DEMO_INVOICE_DETAIL[id];
  if (!doc) {
    return (
      <div className="rounded-md bg-red-50 p-6 text-red-800">
        <h1 className="text-lg font-semibold">Invoice not found</h1>
        <Link href="/accounting/invoices" className="mt-2 inline-block text-sm underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  const ext = doc.extraction_full;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/accounting/invoices" className="text-sm text-slate-700 hover:underline">
            &larr; Invoices
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{doc.file_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                doc.status === "completed" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
              }`}
            >
              {doc.status}
            </span>
            {doc.confidence > 0 && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceColor(doc.confidence)}`}
              >
                Overall {(doc.confidence * 100).toFixed(0)}%
              </span>
            )}
            {doc.processing_time_ms && (
              <span className="text-xs text-slate-600">{doc.processing_time_ms}ms</span>
            )}
          </div>
        </div>

        <InvoiceDemoActions jobId={doc.job_id} />
      </header>

      {doc.error_message && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{doc.error_message}</div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Extracted fields</h2>
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Vendor", ext.vendor],
                ["VAT", ext.vendor_vat],
                ["Invoice #", ext.invoice_number],
                ["Date", ext.invoice_date],
                ["Due date", ext.due_date],
                ["Currency", ext.currency],
                ["Subtotal", ext.subtotal.toFixed(3)],
                ["Tax", ext.tax_amount.toFixed(3)],
                ["Total", ext.total.toFixed(3)],
                ["PO ref", ext.po_reference],
                ["Payment terms", ext.payment_terms],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-medium text-slate-900">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Field confidence</h2>
          <dl className="space-y-2 text-sm">
            {Object.entries(doc.field_confidences).map(([field, conf]) => (
              <div key={field} className="flex items-center justify-between">
                <dt className="text-slate-700">{field}</dt>
                <dd className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceColor(conf)}`}>
                  {(conf * 100).toFixed(0)}%
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {ext.line_items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs font-medium tracking-wide text-slate-600 uppercase">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ext.line_items.map((li, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{li.description}</td>
                    <td className="px-3 py-2 text-slate-700">{li.product_code || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.unit_price.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {li.amount.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {doc.matched_vendor_name && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">Matching</h2>
          <p className="text-sm text-slate-800">
            Matched vendor: <span className="font-medium">{doc.matched_vendor_name}</span>
          </p>
        </div>
      )}
    </div>
  );
}
