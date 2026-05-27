"use client";

import { SearchSelect } from "./SearchSelect";
import { MoneyInput } from "./MoneyInput";
import { LotPicker } from "./LotPicker";
import { formatMoney } from "@/lib/money";
import type { Currency, Product, TaxCode } from "@/types";

export type LineDraft = {
  id: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxCodeId: string;
  lotNumber?: string;
  /** Optional contextual fields used by certain doc types. */
  poLineQtyRemaining?: number;
};

export type ProductLinesEditorProps = {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  products: Product[];
  taxCodes: TaxCode[];
  currency: Currency;
  qtyLabel?: string;
  /** Constrain the product pool (e.g. purchasable-only or sellable-only). */
  filter?: (p: Product) => boolean;
  /** Show LotPicker when product.lotTracked. Defaults to true. */
  enableLot?: boolean;
  /** Read-only mode (used by /edit when posted). */
  readOnly?: boolean;
};

let lineCounter = 0;
const nextLineId = () => `ln_${Date.now()}_${++lineCounter}`;

export function ProductLinesEditor({
  lines,
  onChange,
  products,
  taxCodes,
  currency,
  qtyLabel = "Qty",
  filter,
  enableLot = true,
  readOnly,
}: ProductLinesEditorProps) {
  const visibleProducts = filter ? products.filter(filter) : products;

  const productOptions = visibleProducts.map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
    hint: `${p.uom} · default ${p.defaultPurchasePrice || p.defaultSalePrice} ${currency}`,
    badges: [
      ...(p.lotTracked ? [{ label: "lot-tracked", tone: "amber" as const }] : []),
      ...(!p.purchasable && filter
        ? [{ label: "not purchasable", tone: "slate" as const }]
        : []),
      ...(!p.sellable && filter
        ? [{ label: "not sellable", tone: "slate" as const }]
        : []),
    ],
  }));

  const taxOptions = taxCodes.map((t) => ({
    value: t.id,
    label: t.nameEn,
    hint: `${t.code} · ${(t.rate * 100).toFixed(0)}%`,
  }));

  const addRow = () => {
    onChange([
      ...lines,
      {
        id: nextLineId(),
        productId: "",
        description: "",
        qty: 1,
        unitPrice: 0,
        taxCodeId: taxCodes[0]?.id ?? "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    onChange(lines.filter((l) => l.id !== id));
  };

  const patch = (id: string, patch: Partial<LineDraft>) => {
    onChange(
      lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.productId && patch.productId !== l.productId) {
          const p = products.find((p) => p.id === patch.productId);
          if (p) {
            next.description = p.name;
            next.unitPrice =
              filter && p.sellable
                ? p.defaultSalePrice || p.defaultPurchasePrice
                : p.defaultPurchasePrice || p.defaultSalePrice;
            next.taxCodeId = p.taxCodeId;
          }
        }
        return next;
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No lines yet. Click <span className="font-medium">Add line</span> to start.
          </div>
        ) : null}
        {lines.map((l, i) => {
          const product = products.find((p) => p.id === l.productId);
          const net = l.qty * l.unitPrice;
          const tc = taxCodes.find((t) => t.id === l.taxCodeId);
          const taxAmt = net * (tc?.rate ?? 0);
          const total = net + taxAmt;
          const overReceive =
            typeof l.poLineQtyRemaining === "number" &&
            l.qty > l.poLineQtyRemaining;
          const needsLot =
            enableLot && product?.lotTracked && !l.lotNumber;

          return (
            <div
              key={l.id}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-8 shrink-0 pt-7 text-xs text-slate-400">
                  {i + 1}
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <SearchSelect
                      label="Product"
                      placeholder="Pick a product…"
                      required
                      value={l.productId || null}
                      onChange={(v) => patch(l.id, { productId: v })}
                      options={productOptions}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-700">
                      {qtyLabel}
                      <span className="text-red-600"> *</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.001"
                      value={l.qty}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch(l.id, {
                          qty: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      className={
                        "rounded-md border bg-white px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-50 " +
                        (overReceive ? "border-red-400" : "border-slate-300")
                      }
                    />
                    {overReceive ? (
                      <div className="text-xs text-red-700">
                        Exceeds remaining {l.poLineQtyRemaining}
                      </div>
                    ) : null}
                  </div>
                  <MoneyInput
                    label="Unit price"
                    required
                    value={l.unitPrice}
                    onChange={(v) => patch(l.id, { unitPrice: v })}
                    currency={currency}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-700">
                    Description
                  </label>
                  <input
                    type="text"
                    value={l.description}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(l.id, { description: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </div>
                <SearchSelect
                  label="Tax code"
                  value={l.taxCodeId || null}
                  onChange={(v) => patch(l.id, { taxCodeId: v })}
                  options={taxOptions}
                  disabled={readOnly}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-700">
                    Line total
                  </label>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm font-medium tabular-nums">
                    {formatMoney(total, currency)}
                  </div>
                </div>
              </div>

              {needsLot ? (
                <div className="mt-3 sm:max-w-sm">
                  <LotPicker
                    required
                    value={l.lotNumber ?? null}
                    onChange={(v) => patch(l.id, { lotNumber: v })}
                    lots={[
                      { lotNumber: "DC-2026-Q2", qtyAvailable: 4, expiry: "2027-06-30" },
                      { lotNumber: "DC-2026-Q1", qtyAvailable: 2, expiry: "2027-01-31" },
                    ]}
                  />
                </div>
              ) : null}

              {!readOnly ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeRow(l.id)}
                    disabled={lines.length === 1}
                    className="cursor-pointer text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Remove line
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!readOnly ? (
        <button
          type="button"
          onClick={addRow}
          className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-400 hover:text-slate-900"
        >
          + Add line
        </button>
      ) : null}
    </div>
  );
}

export function createEmptyLine(taxCodeId = ""): LineDraft {
  return {
    id: nextLineId(),
    productId: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    taxCodeId,
  };
}
