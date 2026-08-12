import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { getInternalTransfer } from "@/lib/api/inventory-tx";
import { listProducts } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const trx = await getInternalTransfer(id);
  if (!trx) notFound();
  const products = await listProducts();
  return (
    <DocEditShell
      docNumber={trx.number}
      docTitle={`Transfer ${trx.date}`}
      state={trx.state}
      date={trx.date}
      notes={trx.notes}
      linesPreview={
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {trx.lines.map((l) => {
            const p = products.find((pp) => pp.id === l.productId);
            return (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{p ? `${p.sku} · ${p.name}` : "—"}</span>
                <span className="tabular-nums">
                  {l.qty} {l.lotNumber ? `· lot ${l.lotNumber}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      }
      backHref={`/${locale}/inventory/transfers/${trx.id}`}
    />
  );
}
