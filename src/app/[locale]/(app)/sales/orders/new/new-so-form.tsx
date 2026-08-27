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
import { CreditHoldBanner, CreditLimitWarning } from "@/components/banners";
import { createSalesOrderAction } from "@/lib/actions/q2c";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import type {
  Currency,
  Customer,
  Product,
  Quote,
  TaxCode,
  Warehouse,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

const CURRENCY_OPTIONS: Currency[] = ["KWD", "SAR", "AED", "USD"];

export function NewSoForm({
  locale,
  customers,
  products,
  taxCodes,
  warehouses,
  quote,
}: {
  locale: string;
  customers: Customer[];
  products: Product[];
  taxCodes: TaxCode[];
  warehouses: Warehouse[];
  quote: Quote | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [customerId, setCustomerId] = React.useState(quote?.customerId ?? "");
  const [currency, setCurrency] = React.useState<Currency>(quote?.currency ?? "KWD");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [expectedDate, setExpectedDate] = React.useState(today);
  const [exceptional, setExceptional] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>(
    quote
      ? quote.lines.map((l) => ({
          id: `pre_${l.id}`,
          productId: l.productId,
          description: l.description,
          qty: l.qty,
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

  const customer = customers.find((c) => c.id === customerId);
  const onCreditHold = customer?.paymentStatus === "on_hold";
  const nearLimit =
    customer && customer.exposure / customer.creditLimit >= 0.9 && !onCreditHold;

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => {
    const tc = taxCodes.find((t) => t.id === l.taxCodeId);
    return s + l.qty * l.unitPrice * (tc?.rate ?? 0);
  }, 0);
  const total = subtotal + taxTotal;

  const errors: ValidationError[] = [];
  if (!customerId) errors.push({ field: "customer", message: "Pick a customer." });
  if (!warehouseId) errors.push({ field: "warehouse", message: "Pick a warehouse." });
  if (!date) errors.push({ field: "date", message: "Date required." });
  if (!expectedDate)
    errors.push({ field: "expected delivery", message: "Expected delivery required." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const previewNumber = previewSequence("so", 2026, 99);

  const productLines = () =>
    lines.map((l) => ({
      productId: l.productId,
      description: l.description.trim() || "Item",
      qty: l.qty,
      unitPrice: l.unitPrice,
      ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
      ...(quote && l.id.startsWith("pre_")
        ? { sourceLineId: l.id.slice(4) }
        : {}),
    }));

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    if (intent !== "save_draft" && onCreditHold) {
      toast.error("Customer on credit hold — SO confirm blocked.");
      return;
    }
    setPending(true);
    try {
      const result = await createSalesOrderAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          customerId,
          currency,
          warehouseId,
          date,
          expectedDeliveryDate: expectedDate,
          promisedDate: expectedDate,
          ...(quote ? { quoteId: quote.id } : {}),
          ...(exceptional ? { notes: "Exceptional / project" } : {}),
        },
        lines: productLines(),
        ...(quote
          ? { source: { parents: [{ docType: "quote" as const, docId: quote.id }] } }
          : {}),
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const verb =
        intent === "save_draft" ? "Saved draft" : intent === "post" ? "Posted" : "Confirmed";
      toast.success(
        `${verb}: ${result.data.number} · ${result.data.state} · ${currency} ${total.toFixed(3)}`,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/sales/orders/${result.data.id}`);
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
    if (onCreditHold) {
      toast.error("Customer on credit hold — SO confirm blocked.");
      return;
    }
    const ok = await confirm({
      title: `Confirm ${previewNumber}?`,
      description: `Reserves stock for ${customer?.name ?? ""} totaling ${currency} ${total.toFixed(3)}.${nearLimit ? " Customer near credit limit — review on next payment cycle." : ""}`,
      confirmLabel: "Confirm SO",
    });
    if (!ok) return;
    await runWrite("submit");
  };

  return (
    <DocForm
      title={`New sales order · ${previewNumber}`}
      subtitle={
        quote
          ? `From ${quote.number}`
          : "Manual sales order · backend issues the number on save."
      }
      banner={
        onCreditHold && customer ? (
          <CreditHoldBanner exposure={customer.exposure} limit={customer.creditLimit} />
        ) : nearLimit && customer ? (
          <CreditLimitWarning
            exposure={customer.exposure}
            limit={customer.creditLimit}
          />
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
              badges:
                c.paymentStatus === "on_hold"
                  ? [{ label: "credit hold", tone: "red" as const }]
                  : c.paymentStatus === "overdue_14"
                    ? [{ label: "overdue", tone: "amber" as const }]
                    : undefined,
            }))}
            disabled={!!quote}
            hint={quote ? "Locked by source quote" : undefined}
          />
          <SearchSelect
            label="Currency"
            value={currency}
            onChange={wrap((v: string) => setCurrency(v as Currency))}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
          />
          <SearchSelect
            label="Warehouse"
            required
            value={warehouseId || null}
            onChange={wrap(setWarehouseId)}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <DatePicker label="SO date" required value={date} onChange={wrap(setDate)} />
          <DatePicker
            label="Expected delivery"
            value={expectedDate}
            onChange={wrap(setExpectedDate)}
          />
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={exceptional}
              onChange={(e) => wrap(setExceptional)(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            <span>Exceptional / project (excluded from demand run-rate)</span>
          </label>
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
      approvalPreview={<ApprovalRoutePreview docType="so" amount={total} />}
      errors={errors}
      dirty={dirty}
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0 || onCreditHold}
      submitLabel={onCreditHold ? "Blocked · credit hold" : "Confirm SO"}
    />
  );
}
