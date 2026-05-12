"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import {
  LineItemsEditor,
  createEmptyLineItem,
  lineItemsGrandTotal,
  type LineItemRow,
} from "@/components/line-items-editor";

export type ManualPoRow = {
  date: string;
  po: string;
  vendor: string;
  amount: number;
};

export type ManualPoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (row: ManualPoRow) => void;
};

export function ManualPoModal({ open, onOpenChange, onCreated }: ManualPoModalProps) {
  const t = useTranslations("purchasing.manual");

  const [poNumber, setPoNumber] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [documentDate, setDocumentDate] = React.useState("");
  const [grandTotal, setGrandTotal] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [lineItems, setLineItems] = React.useState<LineItemRow[]>(() => [createEmptyLineItem()]);

  const lineSum = lineItemsGrandTotal(lineItems);

  React.useEffect(() => {
    if (open) return;
    setPoNumber("");
    setVendorName("");
    setDocumentDate("");
    setGrandTotal("");
    setPaymentTerms("");
    setDeliveryDate("");
    setDescription("");
    setLineItems([createEmptyLineItem()]);
  }, [open]);

  const lineLabels = React.useMemo(
    () => ({
      itemNo: t("lineItems.itemNo"),
      description: t("lineItems.description"),
      qty: t("lineItems.qty"),
      unitPrice: t("lineItems.unitPrice"),
      total: t("lineItems.total"),
      addRow: t("lineItems.addRow"),
      removeRow: t("lineItems.removeRow"),
      actionsHeader: t("lineItems.actionsHeader"),
      footerGrandTotal: t("lineItems.footerGrandTotal"),
    }),
    [t],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = poNumber.trim();
    if (!num) {
      toast.message(t("validationPoNumber"));
      return;
    }

    const parsedTotal = parseFloat(grandTotal.trim());
    const total = Number.isFinite(parsedTotal) ? parsedTotal : lineSum;

    const dateStr =
      documentDate.trim() ||
      new Date().toISOString().slice(0, 10);

    const row: ManualPoRow = {
      date: dateStr,
      po: num,
      vendor: vendorName.trim() || "—",
      amount: total,
    };

    onCreated?.(row);
    toast.success(
      t("toastCreated", {
        number: num,
        vendor: row.vendor,
        total: total.toFixed(3),
      }),
    );
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-slate-900">{t("dialogTitle")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">{t("dialogDescription")}</Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("poNumber")} *</span>
                <input
                  required
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("vendorName")}</span>
                <input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("documentDate")}</span>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("grandTotal")}</span>
                <input
                  value={grandTotal}
                  onChange={(e) => setGrandTotal(e.target.value)}
                  placeholder={lineSum > 0 ? lineSum.toFixed(3) : ""}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("paymentTerms")}</span>
                <input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">{t("deliveryDate")}</span>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-800">{t("description")}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">{t("lineItemsSection")}</p>
              <LineItemsEditor items={lineItems} onChange={setLineItems} labels={lineLabels} />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                {t("submit")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
