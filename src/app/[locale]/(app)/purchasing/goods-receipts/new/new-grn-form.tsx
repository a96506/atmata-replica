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
import { OverReceiveBanner } from "@/components/banners";
import { previewSequence } from "@/lib/numbering";
import type {
  Product,
  PurchaseOrder,
  Supplier,
  TaxCode,
  Warehouse,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

export function NewGrnForm({
  locale,
  po,
  products,
  taxCodes,
  warehouses,
  suppliers,
}: {
  locale: string;
  po: PurchaseOrder | null;
  products: Product[];
  taxCodes: TaxCode[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [supplierId, setSupplierId] = React.useState(po?.supplierId ?? "");
  const [warehouseId, setWarehouseId] = React.useState(po?.warehouseId ?? warehouses[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>(
    po
      ? po.lines.map((l) => ({
          id: `pre_${l.id}`,
          productId: l.productId,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
          taxCodeId: l.taxCodeId ?? "",
          poLineQtyRemaining: l.qty,
        }))
      : [createEmptyLine(taxCodes[0]?.id)],
  );

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const overReceiving = lines.some(
    (l) => typeof l.poLineQtyRemaining === "number" && l.qty > l.poLineQtyRemaining,
  );
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  const errors: ValidationError[] = [];
  if (!supplierId) errors.push({ field: "supplier", message: "Supplier required." });
  if (!warehouseId) errors.push({ field: "warehouse", message: "Warehouse required." });
  if (!date) errors.push({ field: "date", message: "Receipt date required." });
  if (lines.length === 0 || totalQty === 0)
    errors.push({ field: "lines", message: "Receive at least one unit." });
  lines.forEach((l, i) => {
    const product = products.find((p) => p.id === l.productId);
    if (product?.lotTracked && !l.lotNumber)
      errors.push({
        field: `line ${i + 1} · lot`,
        message: `Lot required for ${product.name}.`,
      });
  });

  const previewNumber = previewSequence("grn", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    if (overReceiving) {
      const ok = await confirm({
        title: "Over-receive?",
        description:
          "One or more lines exceed the PO ordered quantity. Posting will require approver override.",
        confirmLabel: "Submit for approval",
        tone: "destructive",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: `Post ${previewNumber}?`,
        description: `Receives ${totalQty} unit(s) into ${warehouses.find((w) => w.id === warehouseId)?.name ?? "—"}. Creates stock-in moves and updates PO line qty_received. Demo · this will not persist.`,
        confirmLabel: "Post",
      });
      if (!ok) return;
    }
    toast.success(`Posted (demo): ${previewNumber} · ${totalQty} units`);
    setDirty(false);
    router.push(`/${locale}/purchasing/goods-receipts`);
  };

  const onSaveDraft = () => {
    toast.success(`Saved as draft (demo): ${previewNumber}`);
    setDirty(false);
  };

  const onCancel = async () => {
    if (!dirty) {
      router.back();
      return;
    }
    const ok = await confirm({
      title: "Discard changes?",
      confirmLabel: "Discard",
      tone: "destructive",
    });
    if (ok) {
      setDirty(false);
      router.back();
    }
  };

  return (
    <DocForm
      title={`New goods receipt · ${previewNumber}`}
      subtitle={po ? `Receiving against ${po.number}` : "Receiving without PO reference"}
      banner={
        overReceiving ? (
          <OverReceiveBanner
            ordered={
              lines.reduce((s, l) => s + (l.poLineQtyRemaining ?? 0), 0)
            }
            alreadyReceived={0}
            thisReceipt={totalQty}
          />
        ) : null
      }
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Supplier"
            required
            value={supplierId || null}
            onChange={wrap(setSupplierId)}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!!po}
            hint={po ? "Locked by source PO" : undefined}
          />
          <SearchSelect
            label="Warehouse"
            required
            value={warehouseId || null}
            onChange={wrap(setWarehouseId)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <DatePicker
            label="Receipt date"
            required
            value={date}
            onChange={wrap(setDate)}
          />
        </div>
      }
      lines={
        <ProductLinesEditor
          lines={lines}
          onChange={wrap(setLines)}
          products={products}
          taxCodes={taxCodes}
          currency="KWD"
          qtyLabel="Received"
        />
      }
      notes={
        <textarea
          value={notes}
          onChange={(e) => wrap(setNotes)(e.target.value)}
          placeholder="Condition notes, packaging issues, etc."
          rows={3}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      }
      errors={errors}
      dirty={dirty}
      onSubmit={onSubmit}
      onSaveDraft={onSaveDraft}
      onCancel={onCancel}
      submitDisabled={errors.length > 0}
      submitLabel={overReceiving ? "Submit for approval" : "Post"}
    />
  );
}
