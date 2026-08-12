import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();
  const usage = (c.exposure / c.creditLimit) * 100;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Customer</div>
        <h1 className="text-xl font-semibold text-foreground">{c.name}</h1>
        <p className="text-sm text-muted-foreground">VAT {c.vatNumber ?? "—"}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Credit limit" value={c.creditLimit.toLocaleString()} />
        <Kpi label="Exposure" value={c.exposure.toLocaleString()} />
        <Kpi label="Utilisation" value={`${usage.toFixed(0)}%`} />
        <Kpi label="Payment status" value={c.paymentStatus} />
        <Kpi label="Credit score" value={c.creditScore} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
