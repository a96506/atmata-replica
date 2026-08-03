"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect } from "@/components/form/SearchSelect";
import { MoneyInput } from "@/components/form/MoneyInput";
import { ApprovalRoutePreview } from "@/components/form/ApprovalRoutePreview";
import { previewSequence } from "@/lib/numbering";
import { formatMoney } from "@/lib/money";
import type {
  BankAccount,
  Supplier,
  VendorBill,
} from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

type AllocDraft = { billId: string; amount: number };

export function NewPaymentForm({
  locale,
  bills,
  suppliers,
  banks,
  sourceBill,
}: {
  locale: string;
  bills: VendorBill[];
  suppliers: Supplier[];
  banks: BankAccount[];
  sourceBill: VendorBill | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = new Date().toISOString().slice(0, 10);

  const [supplierId, setSupplierId] = React.useState(sourceBill?.supplierId ?? "");
  const [bankId, setBankId] = React.useState(banks[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [method, setMethod] = React.useState<"wire" | "cheque" | "cash">("wire");
  const [amount, setAmount] = React.useState(
    sourceBill ? sourceBill.total - sourceBill.paid : 0,
  );
  const [allocations, setAllocations] = React.useState<AllocDraft[]>(
    sourceBill
      ? [{ billId: sourceBill.id, amount: sourceBill.total - sourceBill.paid }]
      : [],
  );
  const [dirty, setDirty] = React.useState(false);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const openBills = bills.filter(
    (b) => b.state === "posted" && b.paid < b.total && (!supplierId || b.supplierId === supplierId),
  );

  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  const unallocated = amount - allocated;

  const errors: ValidationError[] = [];
  if (!supplierId) errors.push({ field: "supplier", message: "Supplier required." });
  if (!bankId) errors.push({ field: "bank", message: "Bank account required." });
  if (amount <= 0) errors.push({ field: "amount", message: "Amount must be > 0." });
  if (Math.abs(unallocated) > 0.001)
    errors.push({
      field: "allocation",
      message: `${unallocated > 0 ? "Under" : "Over"}-allocated by ${formatMoney(Math.abs(unallocated), "KWD")}.`,
    });

  const allocFor = (billId: string) =>
    allocations.find((a) => a.billId === billId)?.amount ?? 0;

  const setAlloc = (billId: string, value: number) => {
    setDirty(true);
    setAllocations((prev) => {
      const without = prev.filter((a) => a.billId !== billId);
      return value > 0 ? [...without, { billId, amount: value }] : without;
    });
  };

  const previewNumber = previewSequence("vendor_payment", 2026, 99);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const whtRate = selectedSupplier?.whtApplicable ? selectedSupplier.whtRate ?? 0.05 : 0;
  const whtWithheld = whtRate > 0 ? amount * whtRate : 0;
  const netPay = amount - whtWithheld;

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(`Fix ${errors.length} validation error${errors.length === 1 ? "" : "s"} first.`);
      return;
    }
    const ok = await confirm({
      title: `Post ${previewNumber}?`,
      description: `Pay ${formatMoney(amount, "KWD")} from ${banks.find((b) => b.id === bankId)?.name ?? "—"} to ${suppliers.find((s) => s.id === supplierId)?.name ?? "—"}. ${allocations.length} allocation(s). Generates a JE Dr AP / Cr Bank. Demo · this action will not persist.`,
      confirmLabel: "Post payment",
    });
    if (!ok) return;
    toast.success(`Posted (demo): ${previewNumber} · ${formatMoney(amount, "KWD")}`);
    setDirty(false);
    router.push(`/${locale}/purchasing/payments`);
  };

  return (
    <DocForm
      title={`New vendor payment · ${previewNumber}`}
      subtitle={sourceBill ? `Settling ${sourceBill.number}` : "Manual payment"}
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SearchSelect
            label="Supplier"
            required
            value={supplierId || null}
            onChange={wrap(setSupplierId)}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            disabled={!!sourceBill}
            hint={sourceBill ? "Locked by source bill" : undefined}
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
            onChange={wrap((v: string) => setMethod(v as "wire" | "cheque" | "cash"))}
            options={[
              { value: "wire", label: "Wire" },
              { value: "cheque", label: "Cheque" },
              { value: "cash", label: "Cash" },
            ]}
          />
          <DatePicker label="Payment date" required value={date} onChange={wrap(setDate)} />
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
        <div className="space-y-3">
          {whtRate > 0 ? (
            <div className="rounded-md border border-status-pending-border bg-status-pending-muted p-3 text-sm">
              <div className="font-semibold text-status-pending-foreground">
                Withholding tax applies — {(whtRate * 100).toFixed(0)}%
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-status-pending-foreground">Gross amount</div>
                  <div className="font-mono tabular-nums text-foreground">
                    {formatMoney(amount, "KWD")}
                  </div>
                </div>
                <div>
                  <div className="text-status-pending-foreground">Withheld ({(whtRate * 100).toFixed(0)}%)</div>
                  <div className="font-mono tabular-nums text-destructive">
                    −{formatMoney(whtWithheld, "KWD")}
                  </div>
                </div>
                <div>
                  <div className="text-status-pending-foreground">Net pay</div>
                  <div className="font-mono font-semibold tabular-nums text-status-success-foreground">
                    {formatMoney(netPay, "KWD")}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-status-pending-foreground">
                Posts: Dr AP {formatMoney(amount, "KWD")} · Cr Bank {formatMoney(netPay, "KWD")} · Cr WHT payable {formatMoney(whtWithheld, "KWD")}.
              </div>
            </div>
          ) : null}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {openBills.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No open bills for the selected supplier.
                  </td>
                </tr>
              ) : (
                openBills.map((b) => {
                  const bal = b.total - b.paid;
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-medium">{b.number}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(b.total, b.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(bal, b.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            min={0}
                            max={bal}
                            value={allocFor(b.id)}
                            onChange={(e) =>
                              setAlloc(
                                b.id,
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
        </div>
      }
      approvalPreview={<ApprovalRoutePreview docType="vendor_payment" amount={amount} />}
      errors={errors}
      dirty={dirty}
      onSubmit={onSubmit}
      onSaveDraft={() => {
        toast.success(`Saved as draft (demo): ${previewNumber}`);
        setDirty(false);
      }}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel="Post payment"
    />
  );
}
