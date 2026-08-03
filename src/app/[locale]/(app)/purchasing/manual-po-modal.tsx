"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
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

export function ManualPoModal({
  open,
  onOpenChange,
  onCreated,
}: ManualPoModalProps) {
  const t = useTranslations("purchasing.manual");

  const [poNumber, setPoNumber] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [documentDate, setDocumentDate] = React.useState("");
  const [grandTotal, setGrandTotal] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [lineItems, setLineItems] = React.useState<LineItemRow[]>(() => [
    createEmptyLineItem(),
  ]);

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
    const dateStr = documentDate.trim() || new Date().toISOString().slice(0, 10);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="po-number">
                {t("poNumber")}
                <span className="text-destructive" aria-hidden>
                  {" *"}
                </span>
              </FieldLabel>
              <Input
                id="po-number"
                required
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="po-vendor">{t("vendorName")}</FieldLabel>
              <Input
                id="po-vendor"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="po-date">{t("documentDate")}</FieldLabel>
              <Input
                id="po-date"
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="po-total">{t("grandTotal")}</FieldLabel>
              <Input
                id="po-total"
                value={grandTotal}
                onChange={(e) => setGrandTotal(e.target.value)}
                placeholder={lineSum > 0 ? lineSum.toFixed(3) : ""}
                className="text-end tabular-nums"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="po-terms">{t("paymentTerms")}</FieldLabel>
              <Input
                id="po-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="po-delivery">{t("deliveryDate")}</FieldLabel>
              <Input
                id="po-delivery"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="po-desc">{t("description")}</FieldLabel>
              <Textarea
                id="po-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("lineItemsSection")}</p>
            <LineItemsEditor
              items={lineItems}
              onChange={setLineItems}
              labels={lineLabels}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit">{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
