import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getDeliveryNote } from "@/lib/api/q2c";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const dn = await getDeliveryNote(id);
  if (!dn) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      docNumber={dn.number}
      docTitle={`Delivery ${dn.date} · against ${dn.soId}`}
      state={dn.state}
      date={dn.date}
      linesPreview={
        <DocLines
          lines={dn.lines.map((l) => ({
            id: l.id,
            description: l.description,
            qty: l.qtyDelivered,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
          }))}
          currency="KWD"
          taxCodes={taxCodes}
          qtyHeader="Shipped"
        />
      }
      backHref={`/${locale}/sales/deliveries/${dn.id}`}
    />
  );
}
