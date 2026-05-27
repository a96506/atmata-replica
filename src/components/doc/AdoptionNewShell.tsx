"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  clearAdoptionContext,
  readAdoptionContext,
} from "@/lib/api/adoption";
import type { AdoptionContext, DocType } from "@/types";

/**
 * AdoptionNewShell — a minimal /new form that consumes an AdoptionContext
 * stashed in sessionStorage by AdoptionPicker.
 *
 * Used by doc-types where the full form would be heavy and we want to
 * demonstrate the adoption flow without re-implementing all G-series
 * niceties (FX, period gate, approval preview, validation, etc.).
 *
 * On Save: toast-only persistence + clears the context + navigates back.
 */

export type AdoptionNewShellProps = {
  locale: string;
  targetType: DocType;
  title: string;
  /** Where to go after save (typically the list page). */
  backHref: string;
  /** Optional intro/banner above the lines. */
  banner?: React.ReactNode;
};

export function AdoptionNewShell({
  locale,
  targetType,
  title,
  backHref,
  banner,
}: AdoptionNewShellProps) {
  const router = useRouter();
  const [ctx, setCtx] = React.useState<AdoptionContext | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setCtx(readAdoptionContext(targetType));
    setHydrated(true);
  }, [targetType]);

  if (!hydrated) {
    return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>;
  }

  if (!ctx) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-6">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <p className="mt-2 text-sm text-slate-600">
          No adoption context found in this session. Open a parent document and use the
          <span className="mx-1 font-medium text-orange-700">Adopt to →</span>
          menu to start an adoption.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const allLines = ctx.parents.flatMap((p) =>
    p.lines
      .filter((l) => l.selected && l.qty > 0)
      .map((l) => ({ ...l, parentNumber: p.docNumber })),
  );
  const subtotal = allLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const onSave = () => {
    toast.success(`${title} created (demo · will not persist).`);
    clearAdoptionContext(targetType);
    // eslint-disable-next-line no-console
    console.info("atmata:event", "adoption.committed", {
      targetType,
      parents: ctx.parents.map((p) => `${p.docType}:${p.docId}`),
      lines: allLines.length,
    });
    router.push(backHref);
  };

  const onCancel = () => {
    clearAdoptionContext(targetType);
    router.push(backHref);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          New {targetType}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Adopted from{" "}
          {ctx.parents.map((p, i) => (
            <span key={p.docId}>
              {i > 0 ? ", " : null}
              <a
                href={hrefForParent(p.docType, p.docId, locale)}
                className="text-orange-700 hover:underline"
              >
                {p.docNumber}
              </a>
            </span>
          ))}
          .
        </p>
        {banner ? <div className="mt-3">{banner}</div> : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Lines adopted
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">From</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allLines.map((l, i) => (
              <tr key={l.lineId}>
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">{l.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.unitPrice.toFixed(3)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {(l.qty * l.unitPrice).toFixed(3)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.parentNumber}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right font-medium text-slate-700">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {subtotal.toFixed(3)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Save (demo)
        </button>
      </div>
    </div>
  );
}

function hrefForParent(t: DocType, id: string, locale: string): string {
  switch (t) {
    case "pr": return `/${locale}/purchasing/purchase-requisitions/${id}`;
    case "rfq": return `/${locale}/purchasing/rfqs/${id}`;
    case "po": return `/${locale}/purchasing/purchase-orders/${id}`;
    case "grn": return `/${locale}/purchasing/goods-receipts/${id}`;
    case "vendor_bill": return `/${locale}/purchasing/bills/${id}`;
    case "vendor_return": return `/${locale}/purchasing/vendor-returns/${id}`;
    case "quote": return `/${locale}/sales/quotes/${id}`;
    case "so": return `/${locale}/sales/orders/${id}`;
    case "dn": return `/${locale}/sales/deliveries/${id}`;
    case "customer_invoice": return `/${locale}/sales/invoices/${id}`;
    case "customer_return": return `/${locale}/sales/returns/${id}`;
    default: return `/${locale}`;
  }
}
