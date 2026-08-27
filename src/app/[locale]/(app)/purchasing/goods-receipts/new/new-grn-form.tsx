"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
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
import { createGoodsReceiptAction } from "@/lib/actions/p2p";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import type {
  Product,
  PurchaseOrder,
  Supplier,
  TaxCode,
  Warehouse,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

function poLineIdFromDraft(line: LineDraft): string | null {
  if (line.id.startsWith("pre_")) return line.id.slice(4);
  return null;
}

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
  const actionToast = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

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
  if (!po) errors.push({ field: "PO", message: "Select a purchase order to receive against." });
  if (!supplierId) errors.push({ field: "supplier", message: "Supplier required." });
  if (!warehouseId) errors.push({ field: "warehouse", message: "Warehouse required." });
  if (!date) errors.push({ field: "date", message: "Receipt date required." });
  if (lines.length === 0 || totalQty === 0)
    errors.push({ field: "lines", message: "Receive at least one unit." });
  lines.forEach((l, i) => {
    if (l.qty > 0 && !poLineIdFromDraft(l))
      errors.push({
        field: `line ${i + 1} · PO line`,
        message: "Line must come from the source PO.",
      });
    const product = products.find((p) => p.id === l.productId);
    if (product?.lotTracked && !l.lotNumber)
      errors.push({
        field: `line ${i + 1} · lot`,
        message: `Lot required for ${product.name}.`,
      });
  });

  const previewNumber = previewSequence("grn", 2026, 99);

  const receiptLines = () =>
    lines
      .filter((l) => l.qty > 0)
      .map((l) => ({
        poLineId: poLineIdFromDraft(l)!,
        qtyReceived: l.qty,
        ...(l.description.trim() ? { description: l.description.trim() } : {}),
        ...(l.lotNumber?.trim() ? { lotNumber: l.lotNumber.trim() } : {}),
        ...(l.unitPrice >= 0 ? { unitPrice: l.unitPrice } : {}),
      }));

  const runWrite = async (intent: WriteIntent) => {
    if (pending || !po) return;
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    setPending(true);
    try {
      const result = await createGoodsReceiptAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          poId: po.id,
          warehouseId,
          date,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        lines: receiptLines(),
        source: { parents: [{ docType: "po", docId: po.id }] },
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const verb =
        intent === "save_draft" ? "Saved draft" : intent === "post" ? "Posted" : "Submitted";
      toast.success(`${verb}: ${result.data.number} · ${result.data.state} · ${totalQty} units`);
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/purchasing/goods-receipts/${result.data.id}`);
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

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
      await runWrite("submit");
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Receives ${totalQty} unit(s) into ${warehouses.find((w) => w.id === warehouseId)?.name ?? "—"}. Creates stock-in moves and updates PO line qty_received.`,
      confirmLabel: "Post",
    });
    if (!ok) return;
    await runWrite("post");
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
      subtitle={
        po
          ? `Receiving against ${po.number}`
          : "Open from a PO to receive — backend issues the number on save."
      }
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
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={onCancel}
      submitDisabled={errors.length > 0}
      submitLabel={overReceiving ? "Submit for approval" : "Post"}
    />
  );
}
