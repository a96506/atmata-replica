"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
import { createInternalTransferAction } from "@/lib/actions/inventory";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import type { Product, Warehouse } from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

type TrxLine = { id: string; productId: string; qty: number; lotNumber?: string };

export function NewTransferForm({
  locale,
  products,
  warehouses,
}: {
  locale: string;
  products: Product[];
  warehouses: Warehouse[];
}) {
  const tToast = useTranslations("common.toast");
  const tInvToast = useTranslations("inventory.toast");
  const tForm = useTranslations("inventory.form");
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [fromWh, setFromWh] = React.useState(warehouses[0]?.id ?? "");
  const [toWh, setToWh] = React.useState(warehouses[1]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<TrxLine[]>([
    { id: `ln_${Date.now()}`, productId: "", qty: 1 },
  ]);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const errors: ValidationError[] = [];
  if (!fromWh) errors.push({ field: "from", message: "Source warehouse required." });
  if (!toWh) errors.push({ field: "to", message: "Destination warehouse required." });
  if (fromWh && toWh && fromWh === toWh)
    errors.push({ field: "warehouses", message: "From / to must differ." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const previewNumber = previewSequence("internal_transfer", 2026, 99);

  const setLine = (id: string, patch: Partial<TrxLine>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { id: `ln_${Date.now()}_${Math.random()}`, productId: "", qty: 1 },
    ]);
  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(tToast("formValidation", { count: errors.length }));
      return;
    }
    setPending(true);
    try {
      const result = await createInternalTransferAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          fromWarehouseId: fromWh,
          toWarehouseId: toWh,
          date,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          ...(l.lotNumber?.trim() ? { lotNumber: l.lotNumber.trim() } : {}),
        })),
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const verb =
        intent === "save_draft"
          ? tInvToast("verbDraft")
          : intent === "post"
            ? tInvToast("verbPosted")
            : tInvToast("verbSubmitted");
      toast.success(
        tInvToast("savedWithQty", {
          verb,
          number: result.data.number,
          state: result.data.state,
          qty: totalQty,
        }),
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/inventory/transfers/${result.data.id}`);
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(tToast("formValidation", { count: errors.length }));
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Transfers ${totalQty} unit(s) from ${warehouses.find((w) => w.id === fromWh)?.name ?? ""} to ${warehouses.find((w) => w.id === toWh)?.name ?? ""}. Generates two stock moves (OUT + IN).`,
      confirmLabel: "Post transfer",
    });
    if (!ok) return;
    await runWrite("post");
  };

  return (
    <DocForm
      title={`New internal transfer · ${previewNumber}`}
      subtitle="Backend issues the final number on save."
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="From warehouse"
            required
            value={fromWh || null}
            onChange={wrap(setFromWh)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <SearchSelect
            label="To warehouse"
            required
            value={toWh || null}
            onChange={wrap(setToWh)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <DatePicker label="Date" required value={date} onChange={wrap(setDate)} />
        </div>
      }
      lines={
        <div className="space-y-2">
          {lines.map((l, i) => {
            const product = products.find((p) => p.id === l.productId);
            return (
              <div
                key={l.id}
                className="grid items-end gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[40px_minmax(0,2fr)_120px_minmax(0,1fr)_70px]"
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
                    badges: p.lotTracked
                      ? [{ label: "lot-tracked", tone: "amber" as const }]
                      : undefined,
                  }))}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-foreground">Qty</label>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={l.qty}
                    onChange={(e) =>
                      setLine(l.id, { qty: Number.parseFloat(e.target.value) || 0 })
                    }
                    className="rounded-md border border-input bg-card px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-foreground">Lot</label>
                  <input
                    type="text"
                    value={l.lotNumber ?? ""}
                    placeholder={product?.lotTracked ? tForm("lotRequired") : tForm("lotEmpty")}
                    onChange={(e) => setLine(l.id, { lotNumber: e.target.value })}
                    className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l.id)}
                  disabled={lines.length === 1}
                  className="cursor-pointer rounded-md text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                >
                  Remove
                </button>
              </div>
            );
          })}
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
          placeholder={tForm("transferNotes")}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      }
      errors={errors}
      dirty={dirty}
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel="Post transfer"
    />
  );
}
