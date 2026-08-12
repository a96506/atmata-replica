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
import { CreditHoldBanner, CreditLimitWarning } from "@/components/banners";
import { previewSequence } from "@/lib/numbering";
import type { Currency, Customer, Product, TaxCode } from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

const CURRENCY_OPTIONS: Currency[] = ["KWD", "SAR", "AED", "USD"];

export function NewQuoteForm({
  locale,
  customers,
  products,
  taxCodes,
}: {
  locale: string;
  customers: Customer[];
  products: Product[];
  taxCodes: TaxCode[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [customerId, setCustomerId] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>("KWD");
  const [date, setDate] = React.useState(today);
  const [validUntil, setValidUntil] = React.useState(today);
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<LineDraft[]>([
    createEmptyLine(taxCodes[0]?.id),
  ]);

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
  if (!date) errors.push({ field: "date", message: "Date required." });
  if (!validUntil)
    errors.push({ field: "valid until", message: "Validity date required." });
  if (validUntil && date && new Date(validUntil) < new Date(date))
    errors.push({
      field: "valid until",
      message: "Validity must be ≥ quote date.",
    });
  lines.forEach((l, i) => {
    if (!l.productId)
      errors.push({ field: `line ${i + 1} · product`, message: "Pick a product." });
    if (l.qty <= 0)
      errors.push({ field: `line ${i + 1} · qty`, message: "Qty must be > 0." });
  });

  const previewNumber = previewSequence("quote", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Send ${previewNumber}?`,
      description: `Generates a customer-facing PDF for ${customer?.name ?? ""} totaling ${currency} ${total.toFixed(3)}. Demo · this action will not persist.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    toast.success(`Sent (demo): ${previewNumber} · ${currency} ${total.toFixed(3)}`);
    setDirty(false);
    router.push(`/${locale}/sales/quotes`);
  };

  return (
    <DocForm
      title={`New quote · ${previewNumber}`}
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
              hint: c.vatNumber,
              badges:
                c.paymentStatus === "on_hold"
                  ? [{ label: "credit hold", tone: "red" as const }]
                  : c.paymentStatus === "overdue_14"
                    ? [{ label: "overdue", tone: "amber" as const }]
                    : undefined,
            }))}
          />
          <SearchSelect
            label="Currency"
            value={currency}
            onChange={wrap((v: string) => setCurrency(v as Currency))}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
          />
          <DatePicker label="Quote date" required value={date} onChange={wrap(setDate)} />
          <DatePicker
            label="Valid until"
            required
            value={validUntil}
            onChange={wrap(setValidUntil)}
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
      errors={errors}
      dirty={dirty}
      onSubmit={onSubmit}
      onSaveDraft={() => {
        toast.success(`Saved as draft (demo): ${previewNumber}`);
        setDirty(false);
      }}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel="Send quote"
    />
  );
}
