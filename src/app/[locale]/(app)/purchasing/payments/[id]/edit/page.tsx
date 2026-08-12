import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { getVendorPayment } from "@/lib/api/p2p";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const vpay = await getVendorPayment(id);
  if (!vpay) notFound();
  return (
    <DocEditShell
      docNumber={vpay.number}
      docTitle={`Payment ${vpay.date}`}
      state={vpay.state}
      date={vpay.date}
      linesPreview={
        <ul className="space-y-1 text-sm">
          {vpay.allocations.map((a) => (
            <li
              key={a.billId}
              className="flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2"
            >
              <span className="font-medium">{a.billId}</span>
              <span className="tabular-nums">
                {formatMoney(a.amount, vpay.currency)}
              </span>
            </li>
          ))}
        </ul>
      }
      backHref={`/${locale}/purchasing/payments/${vpay.id}`}
    />
  );
}
