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
import { TaxBreakdown } from "@/components/form/TaxBreakdown";
import { previewSequence } from "@/lib/numbering";
import type { Product, TaxCode, Warehouse } from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

export function NewPrForm({
  locale,
  products,
  taxCodes,
  warehouses,
}: {
  locale: string;
  products: Product[];
  taxCodes: TaxCode[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [neededBy, setNeededBy] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>([
    createEmptyLine(taxCodes[0]?.id),
  ]);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const errors: ValidationError[] = [];
  if (!warehouseId) errors.push({ field: "warehouse", message: "Pick a warehouse." });
  if (!date) errors.push({ field: "date", message: "Date required." });
  if (lines.length === 0)
    errors.push({ field: "lines", message: "Add at least one line." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const previewNumber = previewSequence("pr", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation error${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Submit ${previewNumber}?`,
      description:
        "Routes to the warehouse manager for approval. Once approved, a buyer can convert it to a PO. Demo · this action will not persist.",
      confirmLabel: "Submit",
    });
    if (!ok) return;
    toast.success(`Submitted (demo): ${previewNumber}`);
    setDirty(false);
    router.push(`/${locale}/purchasing`);
  };

  return (
    <DocForm
      title={`New purchase requisition · ${previewNumber}`}
      subtitle="A purchase requisition is an internal request to buy; on approval the buyer raises a PO."
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Warehouse"
            required
            value={warehouseId || null}
            onChange={wrap(setWarehouseId)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <DatePicker label="Date" required value={date} onChange={wrap(setDate)} />
          <DatePicker label="Needed by" value={neededBy} onChange={wrap(setNeededBy)} />
        </div>
      }
      lines={
        <ProductLinesEditor
          lines={lines}
          onChange={wrap(setLines)}
          products={products}
          taxCodes={taxCodes}
          currency="KWD"
          filter={(p) => p.purchasable}
          enableLot={false}
        />
      }
      totals={<TaxBreakdown lines={lines} currency="KWD" taxCodes={taxCodes} />}
      notes={
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => wrap(setNotes)(e.target.value)}
          placeholder="Reason for the request…"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
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
      submitLabel="Submit for approval"
    />
  );
}
