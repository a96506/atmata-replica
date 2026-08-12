"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
import {
  ProductLinesEditor,
  createEmptyLine,
  type LineDraft,
} from "@/components/form/ProductLinesEditor";
import { InsufficientStockBanner, LotRequiredBanner } from "@/components/banners";
import { previewSequence } from "@/lib/numbering";
import type {
  Customer,
  Product,
  SalesOrder,
  TaxCode,
  Warehouse,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

export function NewDnForm({
  locale,
  so,
  customers,
  products,
  taxCodes,
  warehouses,
}: {
  locale: string;
  so: SalesOrder | null;
  customers: Customer[];
  products: Product[];
  taxCodes: TaxCode[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [customerId, setCustomerId] = React.useState(so?.customerId ?? "");
  const [warehouseId, setWarehouseId] = React.useState(so?.warehouseId ?? warehouses[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>(
    so
      ? so.lines.map((l) => ({
          id: `pre_${l.id}`,
          productId: l.productId,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
          taxCodeId: l.taxCodeId ?? "",
        }))
      : [createEmptyLine(taxCodes[0]?.id)],
  );

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const lotMissing = lines.some((l) => {
    const p = products.find((pp) => pp.id === l.productId);
    return p?.lotTracked && !l.lotNumber;
  });

  // Simulated stock check
  const insufficient = lines.find((l) => {
    const p = products.find((pp) => pp.id === l.productId);
    return p?.sku === "SKU-104" && warehouseId === "wh_2" && l.qty > 4;
  });

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  const errors: ValidationError[] = [];
  if (!customerId) errors.push({ field: "customer", message: "Customer required." });
  if (!warehouseId) errors.push({ field: "warehouse", message: "Warehouse required." });
  if (!date) errors.push({ field: "date", message: "Date required." });
  if (totalQty === 0)
    errors.push({ field: "lines", message: "Deliver at least one unit." });
  if (lotMissing)
    errors.push({ field: "lot", message: "Lot required on one or more lines." });
  if (insufficient)
    errors.push({
      field: "stock",
      message: "Insufficient stock at warehouse for one line.",
    });

  const previewNumber = previewSequence("dn", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Ships ${totalQty} unit(s) to ${customers.find((c) => c.id === customerId)?.name ?? ""}. Generates stock-out moves and updates SO line qty_delivered. Demo · this action will not persist.`,
      confirmLabel: "Post",
    });
    if (!ok) return;
    toast.success(`Posted (demo): ${previewNumber} · ${totalQty} units`);
    setDirty(false);
    router.push(`/${locale}/sales/deliveries`);
  };

  return (
    <DocForm
      title={`New delivery note · ${previewNumber}`}
      subtitle={so ? `Delivering against ${so.number}` : "Manual delivery"}
      banner={
        <div className="space-y-2">
          {lotMissing ? <LotRequiredBanner /> : null}
          {insufficient ? (
            <InsufficientStockBanner
              productName={products.find((p) => p.id === insufficient.productId)?.name ?? "—"}
              available={4}
              required={insufficient.qty}
              warehouseName={warehouses.find((w) => w.id === warehouseId)?.name ?? "—"}
            />
          ) : null}
        </div>
      }
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Customer"
            required
            value={customerId || null}
            onChange={wrap(setCustomerId)}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            disabled={!!so}
            hint={so ? "Locked by source SO" : undefined}
          />
          <SearchSelect
            label="Warehouse"
            required
            value={warehouseId || null}
            onChange={wrap(setWarehouseId)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <DatePicker label="Ship date" required value={date} onChange={wrap(setDate)} />
        </div>
      }
      lines={
        <ProductLinesEditor
          lines={lines}
          onChange={wrap(setLines)}
          products={products}
          taxCodes={taxCodes}
          currency="KWD"
          filter={(p) => p.sellable}
          qtyLabel="Shipped"
        />
      }
      errors={errors}
      dirty={dirty}
      onSubmit={onSubmit}
      onSaveDraft={() => {
        toast.success(`Saved as draft (demo): ${previewNumber}`);
        setDirty(false);
      }}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel="Post delivery"
    />
  );
}
