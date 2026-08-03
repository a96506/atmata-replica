"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
import { MoneyInput } from "@/components/form/MoneyInput";
import { previewSequence } from "@/lib/numbering";
import { formatMoney } from "@/lib/money";
import type {
  BankAccount,
  CustomerInvoice,
  Customer,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

type Alloc = { invoiceId: string; amount: number };

export function NewReceiptForm({
  locale,
  invoices,
  customers,
  banks,
  sourceInv,
}: {
  locale: string;
  invoices: CustomerInvoice[];
  customers: Customer[];
  banks: BankAccount[];
  sourceInv: CustomerInvoice | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [customerId, setCustomerId] = React.useState(sourceInv?.customerId ?? "");
  const [bankId, setBankId] = React.useState(banks[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [method, setMethod] = React.useState<"wire" | "cheque" | "cash" | "card">("wire");
  const [amount, setAmount] = React.useState(
    sourceInv ? sourceInv.total - sourceInv.paid : 0,
  );
  const [allocs, setAllocs] = React.useState<Alloc[]>(
    sourceInv
      ? [{ invoiceId: sourceInv.id, amount: sourceInv.total - sourceInv.paid }]
      : [],
  );
  const [dirty, setDirty] = React.useState(false);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const open = invoices.filter(
    (i) => i.state === "posted" && i.paid < i.total && (!customerId || i.customerId === customerId),
  );

  const allocated = allocs.reduce((s, a) => s + a.amount, 0);
  const unallocated = amount - allocated;

  const errors: ValidationError[] = [];
  if (!customerId) errors.push({ field: "customer", message: "Customer required." });
  if (!bankId) errors.push({ field: "bank", message: "Bank account required." });
  if (amount <= 0) errors.push({ field: "amount", message: "Amount must be > 0." });
  if (Math.abs(unallocated) > 0.001)
    errors.push({
      field: "allocation",
      message: `${unallocated > 0 ? "Under" : "Over"}-allocated by ${formatMoney(Math.abs(unallocated), "KWD")}.`,
    });

  const setAlloc = (invoiceId: string, value: number) => {
    setDirty(true);
    setAllocs((prev) => {
      const without = prev.filter((a) => a.invoiceId !== invoiceId);
      return value > 0 ? [...without, { invoiceId, amount: value }] : without;
    });
  };

  const previewNumber = previewSequence("customer_receipt", 2026, 99);

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation issue${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Receive ${formatMoney(amount, "KWD")} from ${customers.find((c) => c.id === customerId)?.name ?? ""}. ${allocs.length} allocation(s). Generates JE Dr Bank / Cr AR. Demo · this action will not persist.`,
      confirmLabel: "Post receipt",
    });
    if (!ok) return;
    toast.success(`Posted (demo): ${previewNumber} · ${formatMoney(amount, "KWD")}`);
    setDirty(false);
    router.push(`/${locale}/sales/receipts`);
  };

  return (
    <DocForm
      title={`New customer receipt · ${previewNumber}`}
      subtitle={sourceInv ? `Settling ${sourceInv.number}` : "Manual receipt"}
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Customer"
            required
            value={customerId || null}
            onChange={wrap(setCustomerId)}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            disabled={!!sourceInv}
            hint={sourceInv ? "Locked by source invoice" : undefined}
          />
          <SearchSelect
            label="Bank account"
            required
            value={bankId || null}
            onChange={wrap(setBankId)}
            options={banks.map((b) => ({ value: b.id, label: b.name, hint: b.iban }))}
          />
          <SearchSelect
            label="Method"
            value={method}
            onChange={wrap((v: string) => setMethod(v as typeof method))}
            options={[
              { value: "wire", label: "Wire" },
              { value: "cheque", label: "Cheque" },
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
            ]}
          />
          <DatePicker
            label="Receipt date"
            required
            value={date}
            onChange={wrap(setDate)}
          />
          <MoneyInput
            label="Amount"
            value={amount}
            onChange={wrap(setAmount)}
            currency="KWD"
            required
          />
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
            <div className="text-muted-foreground">Allocated / Unallocated</div>
            <div className="mt-0.5 font-mono tabular-nums">
              {formatMoney(allocated, "KWD")} / {formatMoney(unallocated, "KWD")}
            </div>
          </div>
        </div>
      }
      lines={
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {open.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No open invoices for the selected customer.
                  </td>
                </tr>
              ) : (
                open.map((i) => {
                  const bal = i.total - i.paid;
                  const a = allocs.find((x) => x.invoiceId === i.id);
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-3 font-medium">{i.number}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(i.total, i.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(bal, i.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            min={0}
                            max={bal}
                            value={a?.amount ?? 0}
                            onChange={(e) =>
                              setAlloc(
                                i.id,
                                Number.parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-32 rounded-md border border-input bg-card px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
      submitLabel="Post receipt"
    />
  );
}
