import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getVendorBill } from "@/lib/api/p2p";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const bill = await getVendorBill(id);
  if (!bill) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      docNumber={bill.number}
      docTitle={`Vendor inv ${bill.invoiceNumber} · ${bill.date}`}
      state={bill.state}
      date={bill.date}
      linesPreview={
        <DocLines lines={bill.lines} currency={bill.currency} taxCodes={taxCodes} />
      }
      backHref={`/${locale}/purchasing/bills/${bill.id}`}
    />
  );
}
