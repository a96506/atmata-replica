"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
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
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

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

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Transfers ${totalQty} unit(s) from ${warehouses.find((w) => w.id === fromWh)?.name ?? ""} to ${warehouses.find((w) => w.id === toWh)?.name ?? ""}. Generates two stock moves (OUT + IN). Demo · this action will not persist.`,
      confirmLabel: "Post transfer",
    });
    if (!ok) return;
    toast.success(`Posted (demo): ${previewNumber} · ${totalQty} units`);
    setDirty(false);
    router.push(`/${locale}/inventory/transfers`);
  };

  return (
    <DocForm
      title={`New internal transfer · ${previewNumber}`}
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
                className="grid items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[40px_minmax(0,2fr)_120px_minmax(0,1fr)_70px]"
              >
                <div className="text-xs text-slate-400">{i + 1}</div>
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
                  <label className="text-xs font-medium text-slate-700">Qty</label>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={l.qty}
                    onChange={(e) =>
                      setLine(l.id, { qty: Number.parseFloat(e.target.value) || 0 })
                    }
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-700">Lot</label>
                  <input
                    type="text"
                    value={l.lotNumber ?? ""}
                    placeholder={product?.lotTracked ? "Required" : "—"}
                    onChange={(e) => setLine(l.id, { lotNumber: e.target.value })}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l.id)}
                  disabled={lines.length === 1}
                  className="cursor-pointer rounded-md text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Remove
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLine}
            className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-400"
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
          placeholder="Transfer reason…"
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
      submitLabel="Post transfer"
    />
  );
}
