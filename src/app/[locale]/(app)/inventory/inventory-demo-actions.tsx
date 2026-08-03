"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";

export function InventoryDemoToolbar() {
  const t = useTranslations("inventory.actions");
  return (
    <button
      type="button"
      className="cursor-pointer rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      onClick={() => toast.message(t("refreshDemo"))}
    >
      {t("refresh")}
    </button>
  );
}

export function ShipmentNoteDemo({ refCode }: { refCode: string }) {
  const t = useTranslations("inventory.actions");
  return (
    <button
      type="button"
      className="cursor-pointer text-xs text-primary hover:underline"
      onClick={() => toast.message(t("delayNote", { ref: refCode }))}
    >
      {t("viewDelay")}
    </button>
  );
}
