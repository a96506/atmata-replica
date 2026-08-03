"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";

export function PoSuggestionActions({ id }: { id: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <button
        type="button"
        className="cursor-pointer rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary"
        onClick={() => toast.success(t("approvePo", { id }))}
      >
        {t("approve")}
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        onClick={() => toast.message(t("adjustPo", { id }))}
      >
        {t("adjust")}
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => toast.message(t("rejectPo", { id }))}
      >
        {t("reject")}
      </button>
    </div>
  );
}

export function BillMatchActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <button
        type="button"
        className="cursor-pointer rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary"
        onClick={() => toast.success(t("approveBill", { id }))}
      >
        {t("approveMatch")}
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        onClick={() => toast.message(t("flagBill", { id, status }))}
      >
        {t("flag")}
      </button>
    </div>
  );
}

export function ReceivingDemoActions({ refCode }: { refCode: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <button
      type="button"
      className="cursor-pointer rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
      onClick={() => toast.success(t("confirmReceipt", { ref: refCode }))}
    >
      {t("confirmReceiptBtn")}
    </button>
  );
}
