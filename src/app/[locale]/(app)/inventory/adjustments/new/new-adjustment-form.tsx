"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
import { ApprovalRoutePreview } from "@/components/form/ApprovalRoutePreview";
import { createStockAdjustmentAction } from "@/lib/actions/inventory";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import type { Product, Warehouse } from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

type AdjLine = {
  id: string;
  productId: string;
  warehouseId: string;
  qtyDelta: number;
  reason: "cycle_count" | "damage" | "expiry" | "theft" | "other";
};

const REASONS = [
  { value: "cycle_count", label: "Cycle count" },
  { value: "damage", label: "Damage" },
  { value: "expiry", label: "Expiry" },
  { value: "theft", label: "Theft" },
  { value: "other", label: "Other" },
];

const APPROVAL_THRESHOLD_KWD = 5_000;

export function NewAdjustmentForm({
  locale,
  products,
  warehouses,
}: {
  locale: string;
  products: Product[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [date, setDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<AdjLine[]>([
    {
      id: `ln_${Date.now()}`,
      productId: "",
      warehouseId: warehouses[0]?.id ?? "",
      qtyDelta: 0,
      reason: "cycle_count",
    },
  ]);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const setLine = (id: string, patch: Partial<AdjLine>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        id: `ln_${Date.now()}_${Math.random()}`,
        productId: "",
        warehouseId: warehouses[0]?.id ?? "",
        qtyDelta: 0,
        reason: "cycle_count",
      },
    ]);
  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const estimatedValue = lines.reduce((s, l) => {
    const p = products.find((pp) => pp.id === l.productId);
    return s + Math.abs(l.qtyDelta) * (p?.defaultPurchasePrice || 0);
  }, 0);

  const needsApproval = estimatedValue > APPROVAL_THRESHOLD_KWD;

  const errors: ValidationError[] = [];
  if (!date) errors.push({ field: "date", message: "Date required." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (!l.warehouseId)
      errors.push({ field: `line ${i + 1} · warehouse`, message: "Pick a warehouse." });
    if (l.qtyDelta === 0)
      errors.push({
        field: `line ${i + 1} · delta`,
        message: "Δqty must be non-zero.",
      });
  });

  const previewNumber = previewSequence("stock_adjustment", 2026, 99);

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    setPending(true);
    try {
      const result = await createStockAdjustmentAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          date,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        lines: lines.map((l) => ({
          productId: l.productId,
          warehouseId: l.warehouseId,
          qtyDelta: l.qtyDelta,
          reason: REASONS.find((r) => r.value === l.reason)?.label ?? l.reason,
        })),
      });
      if (!result.ok) {
        toast.error(result.error.messageKey || result.error.code);
        return;
      }
      const verb =
        intent === "save_draft" ? "Saved draft" : intent === "post" ? "Posted" : "Submitted";
      toast.success(`${verb}: ${result.data.number} · ${result.data.state}`);
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/inventory/adjustments/${result.data.id}`);
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const intent: WriteIntent = needsApproval ? "submit" : "post";
    const ok = await confirm({
      title: `${needsApproval ? "Submit" : "Post"} ${previewNumber}?`,
      description: needsApproval
        ? `Estimated value KWD ${estimatedValue.toFixed(3)} exceeds the ${APPROVAL_THRESHOLD_KWD.toLocaleString()} threshold — routes for warehouse-manager approval.`
        : `Posts the stock adjustment immediately. Generates stock moves + a JE (Dr inventory loss / Cr inventory).`,
      confirmLabel: needsApproval ? "Submit" : "Post",
      tone: "destructive",
    });
    if (!ok) return;
    await runWrite(intent);
  };

  return (
    <DocForm
      title={`New stock adjustment · ${previewNumber}`}
      subtitle={
        needsApproval
          ? `Estimated KWD ${estimatedValue.toFixed(3)} — routes for approval (> ${APPROVAL_THRESHOLD_KWD.toLocaleString()} threshold).`
          : `Estimated KWD ${estimatedValue.toFixed(3)} — posts directly. Backend issues the number on save.`
      }
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <DatePicker label="Date" required value={date} onChange={wrap(setDate)} />
        </div>
      }
      lines={
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="grid items-end gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_120px_minmax(0,1fr)_70px]"
            >
              <div className="text-xs text-muted-foreground">{i + 1}</div>
              <SearchSelect
                label="Product"
                required
                value={l.productId || null}
                onChange={(v) => setLine(l.id, { productId: v })}
                options={products.map((p) => ({
                  value: p.id,
                  label: `${p.sku} · ${p.name}`,
                }))}
              />
              <SearchSelect
                label="Warehouse"
                value={l.warehouseId || null}
                onChange={(v) => setLine(l.id, { warehouseId: v })}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">
                  Δqty (+/-)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={l.qtyDelta}
                  onChange={(e) =>
                    setLine(l.id, {
                      qtyDelta: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  className={
                    "rounded-md border bg-card px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (l.qtyDelta < 0
                      ? "border-status-danger-border"
                      : l.qtyDelta > 0
                        ? "border-status-success-border"
                        : "border-input")
                  }
                />
              </div>
              <SearchSelect
                label="Reason"
                value={l.reason}
                onChange={(v) => setLine(l.id, { reason: v as AdjLine["reason"] })}
                options={REASONS}
              />
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                disabled={lines.length === 1}
                className="cursor-pointer rounded-md text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="cursor-pointer rounded-md border border-dashed border-input bg-card px-3 py-2 text-sm text-foreground hover:border-ring"
          >
            + Add line
          </button>
        </div>
      }
      notes={
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => wrap(setNotes)(e.target.value)}
          placeholder="Explanation for the adjustment…"
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      }
      approvalPreview={
        <ApprovalRoutePreview docType="stock_adjustment" amount={estimatedValue} />
      }
      errors={errors}
      dirty={dirty}
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel={needsApproval ? "Submit for approval" : "Post"}
    />
  );
}
