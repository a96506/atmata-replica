import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getSalesOrder } from "@/lib/api/q2c";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const so = await getSalesOrder(id);
  if (!so) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      docNumber={so.number}
      docTitle={`SO ${so.date} · expected ${so.expectedDeliveryDate}${so.exceptional ? " · exceptional" : ""}`}
      state={so.state}
      date={so.date}
      linesPreview={
        <DocLines lines={so.lines} currency={so.currency} taxCodes={taxCodes} />
      }
      backHref={`/${locale}/sales/orders/${so.id}`}
    />
  );
}
