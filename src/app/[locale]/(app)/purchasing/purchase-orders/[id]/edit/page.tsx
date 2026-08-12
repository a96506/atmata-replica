import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getPurchaseOrder } from "@/lib/api/p2p";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      docNumber={po.number}
      docTitle={`PO date ${po.date} · expected ${po.expectedDate}`}
      state={po.state}
      date={po.date}
      notes={po.notes}
      linesPreview={
        <DocLines lines={po.lines} currency={po.currency} taxCodes={taxCodes} />
      }
      backHref={`/${locale}/purchasing/purchase-orders/${po.id}`}
    />
  );
}
