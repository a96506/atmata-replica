"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreditNote, Currency } from "@/types";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { applyCreditToInvoiceAction } from "@/lib/actions/q2c";
import { formatMoney } from "@/lib/money";
import { canAnyOperation } from "@/lib/roles/capabilities";
import { useSession } from "@/lib/session";

type ApplyCreditTabProps = {
  locale: string;
  invoiceId: string;
  invoiceBalance: number;
  currency: Currency;
  invoiceState: string;
  openCredits: CreditNote[];
  appliedCredits: CreditNote[];
  labels: {
    appliedCredits: string;
    noAppliedCredits: string;
    openCredits: string;
    noOpenCredits: string;
    applySection: string;
    selectCredit: string;
    amount: string;
    apply: string;
    maxHint: string;
    postGl: string;
    colNumber: string;
    colReturn: string;
    colDate: string;
    colTotal: string;
    colRemaining: string;
    colApplied: string;
    colStatus: string;
  };
};

export function ApplyCreditTab({
  locale,
  invoiceId,
  invoiceBalance,
  currency,
  invoiceState,
  openCredits,
  appliedCredits,
  labels,
}: ApplyCreditTabProps) {
  const router = useRouter();
  const { roles } = useSession();
  const actionToast = useActionToast();
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);
  const [creditNoteId, setCreditNoteId] = React.useState(openCredits[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [postGl, setPostGl] = React.useState(false);

  const canApply =
    invoiceState === "posted" &&
    invoiceBalance > 0 &&
    openCredits.length > 0 &&
    canAnyOperation(roles, "apply_credit_to_invoice");

  const selectedCredit = openCredits.find((c) => c.id === creditNoteId);
  const creditRemaining = selectedCredit
    ? selectedCredit.total - selectedCredit.applied
    : 0;
  const maxApply = Math.min(invoiceBalance, creditRemaining);

  React.useEffect(() => {
    if (!creditNoteId && openCredits[0]) {
      setCreditNoteId(openCredits[0].id);
    }
  }, [creditNoteId, openCredits]);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canApply || !creditNoteId || pending) return;

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      actionToast.error({ code: "VALIDATION", messageKey: "errors.validation" });
      return;
    }
    if (parsedAmount > maxApply + 0.001) {
      actionToast.error({ code: "VALIDATION", messageKey: "errors.validation" });
      return;
    }

    setPending(true);
    try {
      const result = await applyCreditToInvoiceAction({
        locale: locale === "ar" ? "ar" : "en",
        invoiceId,
        creditNoteId,
        amount: parsedAmount,
        idempotencyKey: idempotencyKeyRef.current,
        postGl,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      setAmount("");
      toast.success(labels.apply);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const creditColumns = [
    { key: "number", label: labels.colNumber },
    { key: "return", label: labels.colReturn },
    { key: "date", label: labels.colDate },
    { key: "total", label: labels.colTotal, className: "text-right tabular-nums" },
    {
      key: "remaining",
      label: labels.colRemaining,
      className: "text-right tabular-nums",
    },
    { key: "state", label: labels.colStatus },
  ];

  const appliedColumns = [
    { key: "number", label: labels.colNumber },
    { key: "return", label: labels.colReturn },
    { key: "date", label: labels.colDate },
    { key: "total", label: labels.colTotal, className: "text-right tabular-nums" },
    { key: "applied", label: labels.colApplied, className: "text-right tabular-nums" },
    { key: "state", label: labels.colStatus },
  ];

  return (
    <div className="flex flex-col gap-6">
      {canApply ? (
        <form onSubmit={apply} className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-medium">{labels.applySection}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="credit-note">{labels.selectCredit}</Label>
              <Select value={creditNoteId} onValueChange={setCreditNoteId}>
                <SelectTrigger id="credit-note">
                  <SelectValue placeholder={labels.selectCredit} />
                </SelectTrigger>
                <SelectContent>
                  {openCredits.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.number} · {formatMoney(c.total - c.applied, c.currency)} left
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply-amount">{labels.amount}</Label>
              <Input
                id="apply-amount"
                type="number"
                step="0.001"
                min={0.001}
                max={maxApply}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={formatMoney(maxApply, currency)}
                required
              />
              <p className="text-muted-foreground text-xs">
                {labels.maxHint}: {formatMoney(maxApply, currency)}
              </p>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={pending || !creditNoteId}>
                {labels.apply}
              </Button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Checkbox
              id="post-gl"
              checked={postGl}
              onCheckedChange={(v) => setPostGl(v === true)}
              disabled={pending}
            />
            <Label htmlFor="post-gl" className="text-sm font-normal">
              {labels.postGl}
            </Label>
          </div>
        </form>
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-medium">{labels.openCredits}</h3>
        {openCredits.length === 0 ? (
          <p className="text-muted-foreground text-sm">{labels.noOpenCredits}</p>
        ) : (
          <DataTable
            columns={creditColumns}
            rows={openCredits.map((c) => [
              <Link
                key="n"
                href={`/${locale}/sales/credit-notes/${c.id}`}
                className="font-medium text-primary hover:underline"
              >
                {c.number}
              </Link>,
              <Link
                key="r"
                href={`/${locale}/sales/returns/${c.customerReturnId}`}
                className="text-primary hover:underline"
              >
                {c.customerReturnId}
              </Link>,
              c.date,
              formatMoney(c.total, c.currency),
              formatMoney(c.total - c.applied, c.currency),
              <StateBadge key="s" state={c.state} />,
            ])}
            emptyMessage={labels.noOpenCredits}
          />
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">{labels.appliedCredits}</h3>
        {appliedCredits.length === 0 ? (
          <p className="text-muted-foreground text-sm">{labels.noAppliedCredits}</p>
        ) : (
          <DataTable
            columns={appliedColumns}
            rows={appliedCredits.map((c) => [
              <Link
                key="n"
                href={`/${locale}/sales/credit-notes/${c.id}`}
                className="font-medium text-primary hover:underline"
              >
                {c.number}
              </Link>,
              <Link
                key="r"
                href={`/${locale}/sales/returns/${c.customerReturnId}`}
                className="text-primary hover:underline"
              >
                {c.customerReturnId}
              </Link>,
              c.date,
              formatMoney(c.total, c.currency),
              formatMoney(c.applied, c.currency),
              <StateBadge key="s" state={c.state} />,
            ])}
            emptyMessage={labels.noAppliedCredits}
          />
        )}
      </div>
    </div>
  );
}
