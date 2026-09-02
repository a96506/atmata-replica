"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocForm } from "@/components/form/DocForm";
import { DatePicker } from "@/components/form/DatePicker";
import { SearchSelect, strictPrefixFilter } from "@/components/form/SearchSelect";
import { MoneyInput } from "@/components/form/MoneyInput";
import { ApprovalRoutePreview } from "@/components/form/ApprovalRoutePreview";
import { createJournalEntryAction } from "@/lib/actions/gl";
import type { WriteIntent } from "@/lib/actions/validation/p2p";
import { amountsEqual, formatMoney, toMinorUnits } from "@/lib/money";
import { previewSequence } from "@/lib/numbering";
import type { Account } from "@/types";
import type { ValidationError } from "@/components/form/ValidationSummary";

type JeLine = {
  id: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
};

export function NewJeForm({
  locale,
  accounts,
}: {
  locale: string;
  accounts: Account[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const t = useTranslations("accounting.jeForm");
  const tToast = useTranslations("common.toast");
  const today = new Date().toISOString().slice(0, 10);
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [pending, setPending] = React.useState(false);

  const [date, setDate] = React.useState(today);
  const [description, setDescription] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [lines, setLines] = React.useState<JeLine[]>([
    { id: `ln_${Date.now()}_a`, accountId: "", description: "", debit: 0, credit: 0 },
    { id: `ln_${Date.now()}_b`, accountId: "", description: "", debit: 0, credit: 0 },
  ]);

  const wrap =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      setter(v);
    };

  const setLine = (id: string, patch: Partial<JeLine>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        id: `ln_${Date.now()}_${Math.random()}`,
        accountId: "",
        description: "",
        debit: 0,
        credit: 0,
      },
    ]);
  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const totalDr = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = lines.reduce((s, l) => s + l.credit, 0);
  const balanced =
    amountsEqual(totalDr, totalCr, "KWD") && toMinorUnits(totalDr, "KWD") > 0;

  const errors: ValidationError[] = [];
  if (!date) errors.push({ field: "date", message: t("dateRequired") });
  if (!description.trim())
    errors.push({ field: "description", message: t("descriptionRequired") });
  if (!balanced)
    errors.push({
      field: "balance",
      message: t("unbalanced", {
        debit: totalDr.toFixed(3),
        credit: totalCr.toFixed(3),
      }),
    });
  lines.forEach((l, i) => {
    if (!l.accountId)
      errors.push({ field: `line ${i + 1} · account`, message: t("pickAccount") });
    if (l.debit > 0 && l.credit > 0)
      errors.push({
        field: `line ${i + 1} · side`,
        message: t("debitOrCreditOnly"),
      });
    if (l.debit === 0 && l.credit === 0)
      errors.push({
        field: `line ${i + 1} · amount`,
        message: t("enterDebitOrCredit"),
      });
  });

  const previewNumber = previewSequence("journal_entry", 2026, 99);

  const runWrite = async (intent: WriteIntent) => {
    if (pending) return;
    if (errors.length > 0) {
      toast.error(tToast("formValidation", { count: errors.length }));
      return;
    }
    setPending(true);
    try {
      const result = await createJournalEntryAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        intent,
        header: {
          date,
          currency: "KWD",
          notes: description.trim(),
        },
        lines: lines.map((l) => ({
          accountId: l.accountId,
          ...(l.description.trim() ? { description: l.description.trim() } : {}),
          debit: l.debit,
          credit: l.credit,
        })),
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      const verb =
        intent === "save_draft"
          ? t("savedDraft")
          : intent === "submit"
            ? t("submittedForApproval")
            : t("submitted");
      toast.success(
        t("writeSuccess", {
          verb,
          number: result.data.number,
          state: result.data.state,
          amount: formatMoney(totalDr, "KWD"),
        }),
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      setDirty(false);
      router.push(`/${locale}/accounting/journal-entries/${result.data.id}`);
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async () => {
    if (errors.length > 0) {
      toast.error(tToast("formValidation", { count: errors.length }));
      return;
    }
    const ok = await confirm({
      title: t("submitConfirmTitle", { number: previewNumber }),
      description: t("submitConfirmDescription", {
        amount: formatMoney(totalDr, "KWD"),
      }),
      confirmLabel: t("submitConfirmLabel"),
    });
    if (!ok) return;
    await runWrite("submit");
  };

  return (
    <DocForm
      title={t("title", { number: previewNumber })}
      subtitle={t("subtitle")}
      banner={
        <div
          className={
            "rounded-md border p-2 text-xs " +
            (balanced
              ? "border-status-success-border bg-status-success-muted text-status-success-foreground"
              : "border-status-pending-border bg-status-pending-muted text-status-pending-foreground")
          }
        >
          <span className="font-medium">
            {balanced ? t("balanced") : t("unbalancedBanner")}
          </span>{" "}
          · Dr {formatMoney(totalDr, "KWD")} · Cr {formatMoney(totalCr, "KWD")}
        </div>
      }
      header={
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <DatePicker label={t("jeDate")} required value={date} onChange={wrap(setDate)} />
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-foreground">
              {t("description")} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => wrap(setDescription)(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      }
      lines={
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="grid items-end gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[40px_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_70px]"
            >
              <div className="text-xs text-muted-foreground">{i + 1}</div>
              <SearchSelect
                label={t("account")}
                required
                value={l.accountId || null}
                onChange={(v) => setLine(l.id, { accountId: v })}
                filter={strictPrefixFilter}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} · ${a.name}`,
                  hint: a.type,
                }))}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">{t("description")}</label>
                <input
                  type="text"
                  value={l.description}
                  onChange={(e) => setLine(l.id, { description: e.target.value })}
                  className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <MoneyInput
                label={t("debit")}
                value={l.debit}
                onChange={(v) => setLine(l.id, { debit: v, credit: v > 0 ? 0 : l.credit })}
                currency="KWD"
                error={!balanced ? t("mustBalance") : null}
              />
              <MoneyInput
                label={t("credit")}
                value={l.credit}
                onChange={(v) => setLine(l.id, { credit: v, debit: v > 0 ? 0 : l.debit })}
                currency="KWD"
                error={!balanced ? t("mustBalance") : null}
              />
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                disabled={lines.length <= 2}
                className="cursor-pointer rounded-md text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                {t("remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="cursor-pointer rounded-md border border-dashed border-input bg-card px-3 py-2 text-sm text-foreground hover:border-ring"
          >
            {t("addLine")}
          </button>
        </div>
      }
      approvalPreview={<ApprovalRoutePreview docType="journal_entry" amount={totalDr} />}
      errors={errors}
      dirty={dirty}
      pending={pending}
      onSubmit={onSubmit}
      onSaveDraft={() => void runWrite("save_draft")}
      onCancel={() => router.back()}
      submitDisabled={errors.length > 0}
      submitLabel={t("submitLabel")}
    />
  );
}
