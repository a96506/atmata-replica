import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { getCustomerReceipt } from "@/lib/api/q2c";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const rcp = await getCustomerReceipt(id);
  if (!rcp) notFound();
  return (
    <DocEditShell
      docNumber={rcp.number}
      docTitle={`Receipt ${rcp.date} · ${rcp.method}`}
      state={rcp.state}
      date={rcp.date}
      linesPreview={
        <ul className="space-y-1 text-sm">
          {rcp.allocations.map((a) => (
            <li
              key={a.invoiceId}
              className="flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2"
            >
              <span className="font-medium">{a.invoiceId}</span>
              <span className="tabular-nums">
                {formatMoney(a.amount, rcp.currency)}
              </span>
            </li>
          ))}
        </ul>
      }
      backHref={`/${locale}/sales/receipts/${rcp.id}`}
    />
  );
}
