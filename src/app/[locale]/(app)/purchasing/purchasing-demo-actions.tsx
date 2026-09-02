"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const btnPrimary =
  "inline-flex cursor-pointer items-center rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90";
const btnMuted =
  "inline-flex cursor-pointer items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/80";

/** Open PR → new PO with from= param (real navigation, no demo toast). */
export function PoSuggestionActions({ prId }: { prId: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link
        href={`/purchasing/purchase-orders/new?from=${encodeURIComponent(prId)}`}
        className={btnPrimary}
      >
        {t("createPo")}
      </Link>
      <Link
        href={`/purchasing/purchase-requisitions/${prId}`}
        className={btnMuted}
      >
        {t("openPr")}
      </Link>
    </div>
  );
}

/** Bill queue row → vendor bill detail. */
export function BillMatchActions({ id }: { id: string; status?: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/purchasing/bills/${id}`} className={btnPrimary}>
        {t("openBill")}
      </Link>
    </div>
  );
}

/** Receiving queue row → GRN detail. */
export function ReceivingDemoActions({ grnId }: { grnId: string }) {
  const t = useTranslations("purchasing.actions");
  return (
    <Link href={`/purchasing/goods-receipts/${grnId}`} className={btnMuted}>
      {t("openGrn")}
    </Link>
  );
}
