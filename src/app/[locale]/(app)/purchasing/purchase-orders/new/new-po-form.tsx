"use client";

import { useTranslations } from "next-intl";

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
import { createPurchaseOrderAction } from "@/lib/actions/p2p";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { previewSequence } from "@/lib/numbering";
import { useSession } from "@/lib/session";
import type {
  Currency,
  PaymentTerm,
  Product,
  Supplier,
  TaxCode,
  Warehouse,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

const CURRENCY_OPTIONS: Currency[] = ["KWD", "SAR", "AED", "USD"];

export function NewPoForm({
  locale,
  suppliers,
  products,
  taxCodes,
  paymentTerms,
  warehouses,
}: {
  locale: string;
  suppliers: Supplier[];
  products: Product[];
  taxCodes: TaxCode[];
  paymentTerms: PaymentTerm[];
  warehouses: Warehouse[];
}) {
  const t = useTranslations("purchasing");
  const tCommon = useTranslations("common.toast");
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const { role } = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [supplierId, setSupplierId] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>("KWD");
  const [paymentTermId, setPaymentTermId] = React.useState<string>(
    paymentTerms[0]?.id ?? "",
  );
  const [warehouseId, setWarehouseId] = React.useState<string>(
    warehouses[0]?.id ?? "",
  );
  const [date, setDate] = React.useState(today);
  const [expectedDate, setExpectedDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>([
    createEmptyLine(taxCodes[0]?.id),
  ]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => {
    const tc = taxCodes.find((t) => t.id === l.taxCodeId);
    return s + l.qty * l.unitPrice * (tc?.rate ?? 0);
  }, 0);
  const total = subtotal + taxTotal;

  const errors: ValidationError[] = [];
  if (!supplierId) errors.push({ field: "supplier", message: "Pick a supplier." });
  if (!date) errors.push({ field: "date", message: "PO date is required." });
  if (!expectedDate)
    errors.push({ field: "expected date", message: "Expected delivery is required." });
  if (!paymentTermId)
    errors.push({ field: "payment term", message: "Pick a payment term." });
  if (!warehouseId) errors.push({ field: "warehouse", message: "Pick a warehouse." });
  if (lines.length === 0)
    errors.push({ field: "lines", message: "At least one line is required." });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
    if (l.unitPrice < 0)
      errors.push({
        field: `line ${i + 1} · unit price`,
        message: "Unit price must be ≥ 0.",
      });
  });

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
    hint: s.vatNumber ?? undefined,
  }));
  const paymentTermOptions = paymentTerms.map((p) => ({
    value: p.id,
    label: p.nameEn,
    hint: `${p.netDays} days`,
  }));
  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
    hint: w.code,
  }));

  const previewNumber = previewSequence("po", 2026, 99);

  const productLines = () =>
    lines.map((l) => ({
      productId: l.productId,
      description: l.description.trim() || "Item",
      qty: l.qty,
      unitPrice: l.unitPrice,
      ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
    }));

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(tCommon("formValidation", { count: errors.length }));
      return;
    }
    setPending(true);
    try {
      const result = await createPurchaseOrderAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          supplierId,
          currency,
          paymentTermId,
          warehouseId,
          date,
          expectedDate,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        lines: productLines(),
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
      router.push(`/${locale}/purchasing/purchase-orders/${result.data.id}`);
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(tCommon("formValidation", { count: errors.length }));
      return;
    }
    const ok = await confirm({
      title: `Submit ${previewNumber}?`,
      description:
        `Total ${currency} ${total.toFixed(3)}. ` +
        `Routes for approval per the approval rules below.`,
      confirmLabel: "Submit",
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
      description: "Your unsaved entries will be lost.",
      confirmLabel: "Discard",
      tone: "destructive",
    });
    if (ok) {
      setDirty(false);
      router.back();
    }
  };

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  void role; // visible role pill is rendered by global RoleSwitcher

  return (
    <DocForm
      title={`New purchase order · ${previewNumber}`}
      subtitle="Manual create · backend will issue the final number on submit."
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Supplier"
            required
            value={supplierId || null}
            onChange={wrap(setSupplierId)}
            options={supplierOptions}
            error={!supplierId ? "Pick a supplier." : null}
          />
          <SearchSelect
            label="Currency"
            value={currency}
            onChange={wrap((v: string) => setCurrency(v as Currency))}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
          />
          <SearchSelect
            label="Payment term"
            value={paymentTermId || null}
            onChange={wrap(setPaymentTermId)}
            options={paymentTermOptions}
          />
          <SearchSelect
            label="Warehouse"
            required
            value={warehouseId || null}
            onChange={wrap(setWarehouseId)}
            options={warehouseOptions}
          />
          <DatePicker
            label="PO date"
            required
            value={date}
            onChange={wrap(setDate)}
            error={!date ? "PO date is required." : null}
          />
          <DatePicker
            label="Expected delivery"
            value={expectedDate}
            onChange={wrap(setExpectedDate)}
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
          filter={(p) => p.purchasable}
          enableLot={false}
        />
      }
      totals={
        <TaxBreakdown lines={lines} currency={currency} taxCodes={taxCodes} />
      }
      notes={
        <textarea
          value={notes}
          onChange={(e) => wrap(setNotes)(e.target.value)}
          placeholder={t("placeholder.poNotes")}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3}
        />
      }
      approvalPreview={<ApprovalRoutePreview docType="po" amount={total} />}
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
