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
import { ApprovalRoutePreview } from "@/components/form/ApprovalRoutePreview";
import { useSession } from "@/lib/session";
import { previewSequence } from "@/lib/numbering";
import type {
  Company,
  Currency,
  Customer,
  DeliveryNote,
  Product,
  SalesOrder,
  TaxCode,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

const CURRENCY_OPTIONS: Currency[] = ["KWD", "SAR", "AED", "USD"];

export function NewInvoiceForm({
  locale,
  companies,
  customers,
  products,
  taxCodes,
  so,
  dn,
}: {
  locale: string;
  companies: Company[];
  customers: Customer[];
  products: Product[];
  taxCodes: TaxCode[];
  so: SalesOrder | null;
  dn: DeliveryNote | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { companyId } = useSession();
  const today = new Date().toISOString().slice(0, 10);

  const activeCompany = companies.find((c) => c.id === companyId);
  const isSaudi = activeCompany?.taxProfile === "SA";

  const [customerId, setCustomerId] = React.useState(
    so?.customerId ?? dn?.customerId ?? "",
  );
  const [currency, setCurrency] = React.useState<Currency>(so?.currency ?? "KWD");
  const [date, setDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(today);
  const [buyerVat, setBuyerVat] = React.useState("");
  const [isB2B, setIsB2B] = React.useState(true);
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
      : dn
        ? dn.lines.map((l) => ({
            id: `pre_${l.id}`,
            productId: l.productId,
            description: l.description,
            qty: l.qtyDelivered,
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

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => {
    const tc = taxCodes.find((t) => t.id === l.taxCodeId);
    return s + l.qty * l.unitPrice * (tc?.rate ?? 0);
  }, 0);
  const total = subtotal + taxTotal;

  const errors: ValidationError[] = [];
  if (!customerId) errors.push({ field: "customer", message: "Customer required." });
  if (!date) errors.push({ field: "date", message: "Invoice date required." });
  if (!dueDate) errors.push({ field: "due date", message: "Due date required." });
  if (dueDate && date && new Date(dueDate) < new Date(date))
    errors.push({ field: "due date", message: "Due date must be ≥ invoice date." });
  if (isSaudi && isB2B && !buyerVat.trim())
    errors.push({
      field: "buyer VAT",
      message: "Buyer VAT required for Saudi B2B invoices (FATOORA).",
    });

  const previewNumber = previewSequence("customer_invoice", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Issues invoice for ${customers.find((c) => c.id === customerId)?.name ?? ""} totaling ${currency} ${total.toFixed(3)}. ${isSaudi ? "FATOORA QR generated. " : ""}Demo · this action will not persist.`,
      confirmLabel: "Post invoice",
    });
    if (!ok) return;
    toast.success(`Posted (demo): ${previewNumber} · ${currency} ${total.toFixed(3)}`);
    setDirty(false);
    router.push(`/${locale}/sales/invoices`);
  };

  return (
    <DocForm
      title={`New customer invoice · ${previewNumber}`}
      subtitle={
        so
          ? `From ${so.number}${dn ? ` · delivered via ${dn.number}` : ""}`
          : dn
            ? `From ${dn.number}`
            : "Manual invoice"
      }
      banner={
        isSaudi ? (
          <div className="rounded-md border border-status-success-border bg-status-success-muted p-3 text-sm text-status-success-foreground">
            <span className="font-medium">FATOORA Phase 2 active</span> · Buyer VAT,
            seller VAT and QR payload required on post. Active company:{" "}
            {activeCompany?.name}.
          </div>
        ) : null
      }
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Customer"
            required
            value={customerId || null}
            onChange={wrap(setCustomerId)}
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              hint: c.vatNumber,
            }))}
            disabled={!!so || !!dn}
            hint={so || dn ? "Locked by source SO/DN" : undefined}
          />
          <SearchSelect
            label="Currency"
            value={currency}
            onChange={wrap((v: string) => setCurrency(v as Currency))}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
          />
          <DatePicker label="Invoice date" required value={date} onChange={wrap(setDate)} />
          <DatePicker
            label="Due date"
            required
            value={dueDate}
            onChange={wrap(setDueDate)}
            min={date}
          />
          {isSaudi ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">
                  Buyer VAT{isB2B ? <span className="text-destructive"> *</span> : null}
                </label>
                <input
                  type="text"
                  value={buyerVat}
                  onChange={(e) => wrap(setBuyerVat)(e.target.value)}
                  placeholder="SA3xxxxxxxxxxxxx"
                  className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={isB2B}
                  onChange={(e) => wrap(setIsB2B)(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>B2B invoice (buyer VAT required)</span>
              </label>
            </>
          ) : null}
        </div>
      }
      lines={
        <ProductLinesEditor
          lines={lines}
          onChange={wrap(setLines)}
          products={products}
          taxCodes={taxCodes}
          currency={currency}
          filter={(p) => p.sellable}
          enableLot={false}
        />
      }
      totals={<TaxBreakdown lines={lines} currency={currency} taxCodes={taxCodes} />}
      approvalPreview={
        <ApprovalRoutePreview docType="customer_invoice" amount={total} />
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
      submitLabel="Post invoice"
    />
  );
}
