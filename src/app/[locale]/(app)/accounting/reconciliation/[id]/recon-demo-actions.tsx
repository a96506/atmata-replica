"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  acceptReconciliationMatchAction,
  skipBankStatementLineAction,
} from "@/lib/actions/reconciliation";

export function ReconLineActions({
  matchId,
  lineId,
}: {
  matchId?: string | null;
  lineId?: string | null;
}) {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const t = useTranslations("accounting.recon");
  const [pending, setPending] = React.useState(false);

  const onAccept = async () => {
    if (!matchId) {
      toast.error(t("noMatchId"));
      return;
    }
    setPending(true);
    try {
      const result = await acceptReconciliationMatchAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        matchId,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      toast.success(t("matchAccepted"));
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const onSkip = async () => {
    if (!lineId) {
      toast.error(t("noLineId"));
      return;
    }
    setPending(true);
    try {
      const result = await skipBankStatementLineAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        lineId,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      toast.success(t("lineSkipped"));
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex justify-end gap-1">
      {matchId ? (
        <button
          type="button"
          disabled={pending}
          className="cursor-pointer rounded bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-3 py-1 text-xs font-medium hover:bg-status-success/20 disabled:opacity-50"
          onClick={() => void onAccept()}
        >
          {t("match")}
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending || !lineId}
        title={!lineId ? t("lineIdRequired") : undefined}
        className="cursor-pointer rounded bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void onSkip()}
      >
        {t("skip")}
      </button>
    </div>
  );
}

/** @deprecated Use ReconLineActions */
export const ReconDemoActions = ReconLineActions;
