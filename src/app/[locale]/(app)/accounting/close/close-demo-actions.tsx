"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import {
  completePeriodCloseTaskAction,
  rescanPeriodCloseAction,
  startPeriodCloseAction,
} from "@/lib/actions/period-close";

export function CloseDemoToolbar({
  period,
  fiscalPeriodId,
}: {
  period: string;
  fiscalPeriodId?: string | null;
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const confirm = useConfirm();
  const [pending, setPending] = React.useState(false);

  const onStart = async () => {
    if (!fiscalPeriodId) {
      toast.error("No fiscal period id for this month — cannot start close.");
      return;
    }
    const ok = await confirm({
      title: `Start close for ${period}?`,
      description:
        "Soft-closes the fiscal period so posting is locked to `period_adjust` users, then creates the 10-step close checklist. Re-open it from Settings → Fiscal calendar if you need to post more.",
      confirmLabel: "Start close",
      tone: "default",
    });
    if (!ok) return;
    setPending(true);
    try {
      const result = await startPeriodCloseAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        fiscalPeriodId,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      toast.success(`Close started for ${period}.`);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      action="#"
      className="flex items-center gap-2"
      onSubmit={(e) => e.preventDefault()}
    >
      <input
        name="period"
        type="month"
        defaultValue={period}
        className="rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          router.push(`/${locale}/accounting/close?period=${value}`);
        }}
      />
      <button
        type="button"
        disabled={pending || !fiscalPeriodId}
        title={
          !fiscalPeriodId
            ? "Fiscal period not found for this month"
            : undefined
        }
        className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void onStart()}
      >
        Run close
      </button>
    </form>
  );
}

export function CloseStartDemo({
  period,
  fiscalPeriodId,
}: {
  period: string;
  fiscalPeriodId?: string | null;
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const confirm = useConfirm();
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      disabled={pending || !fiscalPeriodId}
      className="mt-4 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
      onClick={() => {
        void (async () => {
          if (!fiscalPeriodId) {
            toast.error("No fiscal period id for this month.");
            return;
          }
          const ok = await confirm({
            title: `Start close for ${period}?`,
            description:
              "Soft-closes the fiscal period so posting is locked to `period_adjust` users, then creates the 10-step close checklist.",
            confirmLabel: "Start close",
          });
          if (!ok) return;
          setPending(true);
          try {
            const result = await startPeriodCloseAction({
              locale: writeLocale,
              idempotencyKey: crypto.randomUUID(),
              fiscalPeriodId,
            });
            if (!result.ok) {
              actionToast.error(result.error);
              return;
            }
            toast.success(`Close started for ${period}.`);
            router.refresh();
          } catch {
            actionToast.network();
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      Run close for {period}
    </button>
  );
}

export function CloseRescanDemo({
  period,
  fiscalPeriodId,
}: {
  period: string;
  fiscalPeriodId?: string | null;
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      disabled={pending || !fiscalPeriodId}
      title={
        !fiscalPeriodId ? "Fiscal period not found for this month" : undefined
      }
      className="cursor-pointer rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => {
        void (async () => {
          if (!fiscalPeriodId) {
            toast.error("No fiscal period id for this month.");
            return;
          }
          setPending(true);
          try {
            const result = await rescanPeriodCloseAction({
              locale: writeLocale,
              idempotencyKey: crypto.randomUUID(),
              fiscalPeriodId,
            });
            if (!result.ok) {
              actionToast.error(result.error);
              return;
            }
            toast.success(`Re-scanned ${period}.`);
            router.refresh();
          } catch {
            actionToast.network();
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      Re-scan
    </button>
  );
}

export function CloseStepDemo({
  period,
  stepName,
  taskId,
}: {
  period: string;
  stepName: string;
  taskId?: string | null;
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      disabled={pending || !taskId}
      title={!taskId ? "Task id required" : undefined}
      className="cursor-pointer rounded bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-3 py-1 text-xs font-medium hover:bg-status-success/20 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => {
        void (async () => {
          if (!taskId) {
            toast.error("Cannot complete step — no period_close_tasks id.");
            return;
          }
          setPending(true);
          try {
            const result = await completePeriodCloseTaskAction({
              locale: writeLocale,
              idempotencyKey: crypto.randomUUID(),
              taskId,
              status: "completed",
            });
            if (!result.ok) {
              actionToast.error(result.error);
              return;
            }
            toast.success(`Step ${stepName} marked complete · ${period}`);
            router.refresh();
          } catch {
            actionToast.network();
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      Mark complete
    </button>
  );
}
