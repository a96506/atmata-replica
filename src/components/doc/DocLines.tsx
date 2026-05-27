import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { LineLineageChip } from "./LineLineageChip";
import type { Currency, TaxCode } from "@/types";

type GenericLine = {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCodeId?: string | null;
  discount?: number;
  qtyReceived?: number;
  qtyDelivered?: number;
  qtyInvoiced?: number;
  /** Optional SKU — when present, the description renders as a link to Product 360. */
  sku?: string;
};

export type DocLinesProps = {
  lines: GenericLine[];
  currency: Currency;
  taxCodes: TaxCode[];
  qtyHeader?: string;
  /** Used to build the Product 360 link when a line carries `sku`. */
  locale?: string;
  /**
   * When set, renders a small mini-bar next to each qty showing how much
   * of that line has flowed downstream. Reads `qtyReceived/Delivered/Invoiced`
   * off the line. Skips rendering on lines where the field is undefined.
   */
  flowedKind?: "received" | "delivered" | "invoiced";
  extraColumn?: { header: string; render: (line: GenericLine) => React.ReactNode };
};

export function DocLines({
  lines,
  currency,
  taxCodes,
  qtyHeader = "Qty",
  locale,
  flowedKind,
  extraColumn,
}: DocLinesProps) {
  let subtotal = 0;
  let taxTotal = 0;
  const fmt = (n: number) => formatMoney(n, currency);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">{qtyHeader}</th>
            <th className="px-4 py-3 text-right">Unit</th>
            <th className="px-4 py-3 text-right">Tax</th>
            <th className="px-4 py-3 text-right">Net</th>
            <th className="px-4 py-3 text-right">Tax amt</th>
            <th className="px-4 py-3 text-right">Total</th>
            {extraColumn ? <th className="px-4 py-3">{extraColumn.header}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => {
            const net = l.qty * l.unitPrice - (l.discount ?? 0);
            const tc = taxCodes.find((t) => t.id === l.taxCodeId);
            const taxAmt = tc ? net * tc.rate : 0;
            subtotal += net;
            taxTotal += taxAmt;
            return (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">
                  {l.sku && locale ? (
                    <Link
                      href={`/${locale}/inventory/products/${encodeURIComponent(l.sku)}`}
                      className="text-slate-900 hover:text-orange-700 hover:underline"
                    >
                      {l.description}
                    </Link>
                  ) : (
                    l.description
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {flowedKind ? (
                    <FlowedCell line={l} kind={flowedKind} />
                  ) : (
                    l.qty
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(l.unitPrice)}</td>
                <td className="px-4 py-3 text-right text-xs text-slate-500">
                  {tc ? `${tc.code} · ${(tc.rate * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(net)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(taxAmt)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(net + taxAmt)}</td>
                {extraColumn ? <td className="px-4 py-3">{extraColumn.render(l)}</td> : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
          <tr>
            <td colSpan={5} className="px-4 py-2 text-right text-slate-500">Subtotal</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(subtotal)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td colSpan={5} className="px-4 py-2 text-right text-slate-500">Tax</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(taxTotal)}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td colSpan={5} className="px-4 py-2 text-right font-medium text-slate-900">Total</td>
            <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(subtotal + taxTotal)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FlowedCell({
  line,
  kind,
}: {
  line: GenericLine;
  kind: "received" | "delivered" | "invoiced";
}) {
  const flowed =
    kind === "received"
      ? line.qtyReceived
      : kind === "delivered"
        ? line.qtyDelivered
        : line.qtyInvoiced;
  if (flowed === undefined) return <span>{line.qty}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span>{line.qty}</span>
      <LineLineageChip ordered={line.qty} flowed={flowed} label={kind} />
    </span>
  );
}
