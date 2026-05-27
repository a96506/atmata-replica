import { notFound } from "next/navigation";
import { getSupplier } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getSupplier(id);
  if (!s) notFound();
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">Supplier</div>
        <h1 className="text-xl font-semibold text-slate-900">{s.name}</h1>
        <p className="text-sm text-slate-600">VAT {s.vatNumber ?? "—"}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Bank account" value={s.bankAccount ?? "—"} />
        <Kpi label="Payment term" value={s.paymentTermId} />
        <Kpi
          label="Withholding tax"
          value={s.whtApplicable ? `${((s.whtRate ?? 0.05) * 100).toFixed(0)}%` : "Not applicable"}
        />
      </div>
      {s.whtApplicable ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Payments to this supplier will withhold {((s.whtRate ?? 0.05) * 100).toFixed(0)}% per applicable WHT rules.
          The vendor-payment form will surface a WHT block when this supplier is selected.
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
