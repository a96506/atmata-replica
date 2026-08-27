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
import { TaxBreakdown } from "@/components/form/TaxBreakdown";
import { ApprovalRoutePreview } from "@/components/form/ApprovalRoutePreview";
import { createCustomerInvoiceAction } from "@/lib/actions/q2c";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
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
  companies: _companies,
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
  void _companies;
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [customerId, setCustomerId] = React.useState(
    so?.customerId ?? dn?.customerId ?? "",
  );
  const [currency, setCurrency] = React.useState<Currency>(so?.currency ?? "KWD");
  const [date, setDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(today);
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
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const previewNumber = previewSequence("customer_invoice", 2026, 99);

  const invoiceLines = () =>
    lines.map((l) => {
      const sourceId = l.id.startsWith("pre_") ? l.id.slice(4) : undefined;
      return {
        productId: l.productId,
        description: l.description.trim() || "Item",
        qty: l.qty,
        unitPrice: l.unitPrice,
        ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
        ...(so && sourceId ? { soLineId: sourceId } : {}),
        ...(dn && !so && sourceId ? { dnLineId: sourceId } : {}),
      };
    });

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    setPending(true);
    try {
      const result = await createCustomerInvoiceAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          customerId,
          date,
          dueDate,
          currency,
          ...(so ? { soId: so.id } : {}),
          ...(dn ? { dnId: dn.id } : {}),
        },
        lines: invoiceLines(),
        ...(so || dn
          ? {
              source: {
                parents: [
                  ...(so ? [{ docType: "so" as const, docId: so.id }] : []),
                  ...(dn ? [{ docType: "dn" as const, docId: dn.id }] : []),
                ],
              },
            }
          : {}),
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const verb =
        intent === "save_draft" ? "Saved draft" : intent === "post" ? "Posted" : "Submitted";
      toast.success(
        `${verb}: ${result.data.number} · ${result.data.state} · ${currency} ${total.toFixed(3)}`,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/sales/invoices/${result.data.id}`);
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
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Issues invoice for ${customers.find((c) => c.id === customerId)?.name ?? ""} totaling ${currency} ${total.toFixed(3)}.`,
      confirmLabel: "Post invoice",
    });
    if (!ok) return;
    await runWrite("post");
  };

  return (
    <DocForm
      title={`New customer invoice · ${previewNumber}`}
      subtitle={
        so
          ? `From ${so.number}${dn ? ` · delivered via ${dn.number}` : ""}`
          : dn
            ? `From ${dn.number}`
            : "Manual invoice · backend issues the number on save."
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
              hint: c.vatNumber ?? undefined,
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
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel="Post invoice"
    />
  );
}
