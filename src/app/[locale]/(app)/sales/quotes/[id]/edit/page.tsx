import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { DocLines } from "@/components/doc/DocLines";
import { getQuote } from "@/lib/api/q2c";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  const taxCodes = await listTaxCodes();
  // Quote state literals include "accepted" | "expired" — coerce for shell.
  const shellState =
    q.state === "accepted" ? "confirmed" : q.state === "expired" ? "cancelled" : q.state;
  return (
    <DocEditShell
      docNumber={q.number}
      docTitle={`Quote ${q.date} · valid until ${q.validUntil}`}
      state={shellState}
      date={q.date}
      notes={q.notes}
      linesPreview={
        <DocLines lines={q.lines} currency={q.currency} taxCodes={taxCodes} />
      }
      backHref={`/${locale}/sales/quotes/${q.id}`}
    />
  );
}
