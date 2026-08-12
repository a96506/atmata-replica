"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SearchSelect } from "./SearchSelect";
import { MoneyInput } from "./MoneyInput";
import { LotPicker } from "./LotPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
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
  // Line ids embed Date.now(), so they differ between the server and client
  // render. Field ids derive from a stable useId + row index instead.
  const uid = useId();
  const visibleProducts = filter ? products.filter(filter) : products;

  const productOptions = visibleProducts.map((p) => ({
    value: p.id,
    label: `${p.sku} · ${p.name}`,
    hint: `${p.uom} · default ${p.defaultPurchasePrice || p.defaultSalePrice} ${currency}`,
    badges: [
      ...(p.lotTracked
        ? [{ label: "lot-tracked", tone: "amber" as const }]
        : []),
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
    <div className="flex flex-col gap-3">
      {lines.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No lines yet. Use <span className="font-medium">Add line</span> to
          start.
        </div>
      ) : null}

      {lines.map((l, i) => {
        const product = products.find((p) => p.id === l.productId);
        const net = l.qty * l.unitPrice;
        const tc = taxCodes.find((t) => t.id === l.taxCodeId);
        const total = net + net * (tc?.rate ?? 0);
        const overReceive =
          typeof l.poLineQtyRemaining === "number" &&
          l.qty > l.poLineQtyRemaining;
        const needsLot = enableLot && product?.lotTracked && !l.lotNumber;

        return (
          <div
            key={l.id}
            className="bg-card flex flex-col gap-3 rounded-lg border p-3"
          >
            {/* Line identity: number, product, and the row-level remove action. */}
            <div className="flex items-end gap-2">
              <span className="text-muted-foreground bg-muted flex size-6 shrink-0 items-center justify-center rounded text-xs font-medium tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
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
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(l.id)}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>

            {/* Numeric grid: quantities and money stay grouped and aligned. */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field data-invalid={overReceive ? true : undefined}>
                <FieldLabel htmlFor={`${uid}-${i}-qty`}>
                  {qtyLabel}
                  <span className="text-destructive" aria-hidden>
                    {" *"}
                  </span>
                </FieldLabel>
                <Input
                  id={`${uid}-${i}-qty`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={l.qty}
                  disabled={readOnly}
                  aria-invalid={overReceive}
                  onChange={(e) =>
                    patch(l.id, {
                      qty: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-end tabular-nums"
                />
                {overReceive ? (
                  <FieldDescription className="text-destructive">
                    Exceeds remaining {l.poLineQtyRemaining}
                  </FieldDescription>
                ) : null}
              </Field>

              <MoneyInput
                label="Unit price"
                required
                value={l.unitPrice}
                onChange={(v) => patch(l.id, { unitPrice: v })}
                currency={currency}
                disabled={readOnly}
              />

              <SearchSelect
                label="Tax code"
                value={l.taxCodeId || null}
                onChange={(v) => patch(l.id, { taxCodeId: v })}
                options={taxOptions}
                disabled={readOnly}
              />

              <Field>
                <FieldLabel>Line total</FieldLabel>
                <output
                  className={cn(
                    "bg-muted/50 text-foreground flex h-9 items-center justify-end rounded-md border px-3 text-sm font-medium tabular-nums",
                  )}
                >
                  {formatMoney(total, currency)}
                </output>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${uid}-${i}-desc`}>Description</FieldLabel>
              <Input
                id={`${uid}-${i}-desc`}
                type="text"
                value={l.description}
                disabled={readOnly}
                onChange={(e) => patch(l.id, { description: e.target.value })}
              />
            </Field>

            {needsLot ? (
              <div className="sm:max-w-sm">
                <LotPicker
                  required
                  value={l.lotNumber ?? null}
                  onChange={(v) => patch(l.id, { lotNumber: v })}
                  lots={[
                    {
                      lotNumber: "DC-2026-Q2",
                      qtyAvailable: 4,
                      expiry: "2027-06-30",
                    },
                    {
                      lotNumber: "DC-2026-Q1",
                      qtyAvailable: 2,
                      expiry: "2027-01-31",
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="self-start border-dashed"
        >
          <Plus data-icon="inline-start" />
          Add line
        </Button>
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
