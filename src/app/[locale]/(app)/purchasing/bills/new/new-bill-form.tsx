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
import { FxRateInput } from "@/components/form/FxRateInput";
import { DuplicateBillBanner, FxRateBanner } from "@/components/banners";
import { createVendorBillAction } from "@/lib/actions/p2p";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import { readAdoptionContext, clearAdoptionContext } from "@/lib/api/adoption";
import type {
  AdoptionContext,
  Currency,
  GoodsReceipt,
  PaymentTerm,
  Product,
  PurchaseOrder,
  Supplier,
  TaxCode,
  VendorBill,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

const CURRENCY_OPTIONS: Currency[] = ["KWD", "SAR", "AED", "USD"];

export function NewBillForm({
  locale,
  po,
  grn,
  existingBills,
  products,
  taxCodes,
  suppliers,
  paymentTerms,
}: {
  locale: string;
  po: PurchaseOrder | null;
  grn: GoodsReceipt | null;
  existingBills: VendorBill[];
  products: Product[];
  taxCodes: TaxCode[];
  suppliers: Supplier[];
  paymentTerms: PaymentTerm[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  // Read AdoptionContext on mount: multi-hop adoption from PR/RFQ stashes
  // it via AdoptionPicker. If neither po nor grn is set via query params,
  // we may still have an adopted parent here.
  const [adoptionCtx, setAdoptionCtx] = React.useState<AdoptionContext | null>(null);
  React.useEffect(() => {
    if (po || grn) return; // already handled by traditional flow
    const ctx = readAdoptionContext("vendor_bill");
    if (ctx) {
      setAdoptionCtx(ctx);
      clearAdoptionContext("vendor_bill");
    }
  }, [po, grn]);

  const adoptionParent = adoptionCtx?.parents[0];
  const adoptionIsThin =
    adoptionParent &&
    adoptionParent.docType !== "po" &&
    adoptionParent.docType !== "grn";

  const [supplierId, setSupplierId] = React.useState(
    po?.supplierId ?? grn?.supplierId ?? "",
  );
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>(po?.currency ?? "KWD");
  const [date, setDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(today);
  const [paymentTermId, setPaymentTermId] = React.useState(
    po?.paymentTermId ?? paymentTerms[0]?.id ?? "",
  );
  const [fxRate, setFxRate] = React.useState(0);
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
        }))
      : [createEmptyLine(taxCodes[0]?.id)],
  );

  // When AdoptionContext hydrates after mount (thin parent), pre-fill lines.
  React.useEffect(() => {
    if (!adoptionParent) return;
    const selected = adoptionParent.lines.filter((l) => l.selected && l.qty > 0);
    if (selected.length === 0) return;
    setLines(
      selected.map((l) => ({
        id: `pre_${l.lineId}`,
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxCodeId: l.taxCodeId ?? taxCodes[0]?.id ?? "",
      })),
    );
  }, [adoptionParent, taxCodes]);

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

  const duplicate = invoiceNumber
    ? existingBills.find(
        (b) =>
          b.supplierId === supplierId &&
          b.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase(),
      )
    : null;

  const isFx = currency !== "KWD";

  const errors: ValidationError[] = [];
  if (!supplierId) errors.push({ field: "supplier", message: "Supplier required." });
  if (!invoiceNumber.trim())
    errors.push({ field: "invoice number", message: "Vendor invoice number required." });
  if (!date) errors.push({ field: "date", message: "Bill date required." });
  if (!dueDate) errors.push({ field: "due date", message: "Due date required." });
  if (dueDate && date && new Date(dueDate) < new Date(date))
    errors.push({ field: "due date", message: "Due date must be ≥ bill date." });
  if (isFx && (!fxRate || fxRate <= 0))
    errors.push({ field: "fx rate", message: "FX rate required for foreign-currency bill." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const previewNumber = previewSequence("vendor_bill", 2026, 99);

  const billLines = () =>
    lines.map((l) => {
      const poLineId = l.id.startsWith("pre_") ? l.id.slice(4) : undefined;
      return {
        productId: l.productId,
        description: l.description.trim() || "Item",
        qty: l.qty,
        unitPrice: l.unitPrice,
        ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
        ...(po && poLineId ? { poLineId } : {}),
      };
    });

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation error${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    setPending(true);
    try {
      const result = await createVendorBillAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          supplierId,
          invoiceNumber: invoiceNumber.trim(),
          date,
          dueDate,
          currency,
          ...(po ? { poId: po.id } : {}),
          ...(grn ? { grnId: grn.id } : {}),
        },
        lines: billLines(),
        ...(po || grn
          ? {
              source: {
                parents: [
                  ...(po ? [{ docType: "po" as const, docId: po.id }] : []),
                  ...(grn ? [{ docType: "grn" as const, docId: grn.id }] : []),
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
      router.push(`/${locale}/purchasing/bills/${result.data.id}`);
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation error${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const warnings: string[] = [];
    if (duplicate)
      warnings.push(
        `Duplicate vendor invoice number — already used on ${duplicate.number}.`,
      );
    const ok = await confirm({
      title: `Submit ${previewNumber}?`,
      description:
        `Total ${currency} ${total.toFixed(3)}. ` +
        (isFx ? `Converted at FX ${fxRate} → ${(total * fxRate).toFixed(3)} KWD. ` : "") +
        (po ? `Will 3-way match against ${po.number}` : "") +
        (grn ? ` and ${grn.number}` : "") +
        "." +
        (warnings.length ? `\n\nWarnings:\n• ${warnings.join("\n• ")}` : ""),
      confirmLabel: "Submit",
      tone: duplicate ? "destructive" : "default",
    });
    if (!ok) return;
    await runWrite("submit");
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
      title={`New vendor bill · ${previewNumber}`}
      subtitle={
        po
          ? `From ${po.number}${grn ? ` · received via ${grn.number}` : ""}`
          : "Manual bill (no PO reference) · backend issues the number on save."
      }
      banner={
        <div className="space-y-2">
          {adoptionIsThin && adoptionParent ? (
            <div className="rounded-md border border-status-pending-border bg-status-pending-muted p-3 text-sm text-status-pending-foreground">
              <strong>Multi-hop adoption from {adoptionParent.docType.toUpperCase()} {adoptionParent.docNumber}.</strong>{" "}
              No PO or GRN in this chain — pick the supplier, currency, and payment term manually.
            </div>
          ) : null}
          {duplicate ? (
            <DuplicateBillBanner
              existingBillId={duplicate.id}
              existingNumber={duplicate.number}
              locale={locale}
            />
          ) : null}
          {isFx ? <FxRateBanner docCurrency={currency} baseCurrency="KWD" /> : null}
        </div>
      }
      header={
        <div className="space-y-3">
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Vendor invoice number <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => wrap(setInvoiceNumber)(e.target.value)}
                placeholder="As printed on the supplier invoice"
                className={
                  "rounded-md border bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (duplicate ? "border-status-pending-border" : "border-input")
                }
              />
              {duplicate ? (
                <div className="text-xs text-status-pending-foreground">
                  Already on {duplicate.number}.
                </div>
              ) : null}
            </div>
            <SearchSelect
              label="Currency"
              value={currency}
              onChange={wrap((v: string) => setCurrency(v as Currency))}
              options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
            />
            <DatePicker label="Bill date" required value={date} onChange={wrap(setDate)} />
            <DatePicker
              label="Due date"
              required
              value={dueDate}
              onChange={wrap(setDueDate)}
              min={date}
            />
            <SearchSelect
              label="Payment term"
              value={paymentTermId || null}
              onChange={wrap(setPaymentTermId)}
              options={paymentTerms.map((p) => ({
                value: p.id,
                label: p.nameEn,
                hint: `${p.netDays} days`,
              }))}
            />
          </div>
          {isFx ? (
            <FxRateInput
              docCurrency={currency}
              baseCurrency="KWD"
              rate={fxRate}
              onRateChange={wrap(setFxRate)}
              amount={total}
              date={date}
            />
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
          filter={(p) => p.purchasable}
          enableLot={false}
        />
      }
      totals={<TaxBreakdown lines={lines} currency={currency} taxCodes={taxCodes} />}
      approvalPreview={<ApprovalRoutePreview docType="vendor_bill" amount={total} />}
      errors={errors}
      dirty={dirty}
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={onCancel}
      submitDisabled={errors.length > 0}
      submitLabel="Submit for approval"
    />
  );
}
