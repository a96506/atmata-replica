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
import type { DocumentJob } from "@/lib/demo-data";
import {
  LineItemsEditor,
  createEmptyLineItem,
  lineItemsGrandTotal,
  type LineItemRow,
} from "@/components/line-items-editor";

export type ManualInvoiceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (doc: DocumentJob) => void;
};

export function ManualInvoiceModal({ open, onOpenChange, onCreated }: ManualInvoiceModalProps) {
  const t = useTranslations("accounting.manual");

  const [documentNumber, setDocumentNumber] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [documentDate, setDocumentDate] = React.useState("");
  const [grandTotal, setGrandTotal] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [referencePo, setReferencePo] = React.useState("");
  const [taxNote, setTaxNote] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [lineItems, setLineItems] = React.useState<LineItemRow[]>(() => [createEmptyLineItem()]);

  const lineSum = lineItemsGrandTotal(lineItems);

  React.useEffect(() => {
    if (open) return;
    setDocumentNumber("");
    setVendorName("");
    setDocumentDate("");
    setGrandTotal("");
    setPaymentTerms("");
    setDeliveryDate("");
    setReferencePo("");
    setTaxNote("");
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
    const num = documentNumber.trim();
    if (!num) {
      toast.message(t("validationInvoiceNumber"));
      return;
    }

    const parsedTotal = parseFloat(grandTotal.trim());
    const total = Number.isFinite(parsedTotal) ? parsedTotal : lineSum;

    const job_id = 910_000 + Math.floor(Math.random() * 89_000);
    const doc: DocumentJob = {
      job_id,
      file_name: `Manual · ${num}`,
      document_type: "invoice",
      status: "queued",
      confidence: 1,
      matched_vendor_name: vendorName.trim() || "—",
      extraction: {
        vendor: vendorName.trim() || "—",
        total,
        currency: "KWD",
      },
      created_at: new Date().toISOString(),
    };

    onCreated?.(doc);
    toast.success(
      t("toastCreated", {
        number: num,
        vendor: vendorName.trim() || "—",
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
              <FieldLabel htmlFor="inv-number">
                {t("invoiceNumber")}
                <span className="text-destructive" aria-hidden>
                  {" *"}
                </span>
              </FieldLabel>
              <Input
                id="inv-number"
                required
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="inv-vendor">{t("vendorName")}</FieldLabel>
              <Input
                id="inv-vendor"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
              />
            </Field>

            <DatePicker
              label={t("documentDate")}
              value={documentDate}
              onChange={setDocumentDate}
            />

            <Field>
              <FieldLabel htmlFor="inv-total">{t("grandTotal")}</FieldLabel>
              <Input
                id="inv-total"
                value={grandTotal}
                onChange={(e) => setGrandTotal(e.target.value)}
                placeholder={lineSum > 0 ? lineSum.toFixed(3) : ""}
                className="text-end tabular-nums"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="inv-terms">{t("paymentTerms")}</FieldLabel>
              <Input
                id="inv-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="inv-delivery">{t("deliveryDate")}</FieldLabel>
              <Input
                id="inv-delivery"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="inv-po">{t("referencePo")}</FieldLabel>
              <Input
                id="inv-po"
                value={referencePo}
                onChange={(e) => setReferencePo(e.target.value)}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="inv-tax">{t("taxNote")}</FieldLabel>
              <Textarea
                id="inv-tax"
                value={taxNote}
                onChange={(e) => setTaxNote(e.target.value)}
                rows={2}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="inv-desc">{t("description")}</FieldLabel>
              <Textarea
                id="inv-desc"
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
