import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getCustomerInvoice } from "@/lib/api/q2c";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const inv = await getCustomerInvoice(id);
  if (!inv) notFound();
  const taxCodes = await listTaxCodes();
  return (
    <DocEditShell
      docNumber={inv.number}
      docTitle={`Customer invoice · due ${inv.dueDate}`}
      state={inv.state}
      date={inv.date}
      linesPreview={
        <DocLines lines={inv.lines} currency={inv.currency} taxCodes={taxCodes} />
      }
      backHref={`/${locale}/sales/invoices/${inv.id}`}
    />
  );
}
