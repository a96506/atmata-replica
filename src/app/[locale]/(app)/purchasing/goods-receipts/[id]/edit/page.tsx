import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getGoodsReceipt } from "@/lib/api/p2p";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const grn = await getGoodsReceipt(id);
  if (!grn) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      locale={locale === "ar" ? "ar" : "en"}
      docType="grn"
      docId={grn.id}
      expectedRowVersion={grn.rowVersion}
      docNumber={grn.number}
      docTitle={`GRN against ${grn.poId}`}
      state={grn.state}
      date={grn.date}
      notes={grn.notes ?? undefined}
      linesPreview={
        <DocLines
          lines={grn.lines.map((l) => ({
            id: l.id,
            description: l.description,
            qty: l.qtyReceived,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
          }))}
          currency="KWD"
          taxCodes={taxCodes}
          qtyHeader="Received"
        />
      }
      backHref={`/${locale}/purchasing/goods-receipts/${grn.id}`}
    />
  );
}
