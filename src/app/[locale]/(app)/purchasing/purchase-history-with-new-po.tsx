"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data-table";
import { formatKwd } from "@/lib/utils";
import { ManualPoModal, type ManualPoRow } from "./manual-po-modal";

type HistoryRow = { date: string; po: string; vendor: string; amount: number };

export function PurchaseHistoryWithNewPo({
  initialRows,
  locale,
}: {
  initialRows: HistoryRow[];
  locale: "en" | "ar";
}) {
  const t = useTranslations("purchasing");
  const tm = useTranslations("purchasing.manual");
  const [rows, setRows] = React.useState<HistoryRow[]>(initialRows);
  const [modalOpen, setModalOpen] = React.useState(false);

  const onCreated = React.useCallback((row: ManualPoRow) => {
    setRows((prev) => [row, ...prev]);
  }, []);

  return (
    <section className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t("secPurchaseHistory")}</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          {tm("newPo")}
        </button>
      </div>
      <DataTable
        columns={[
          { key: "d", label: t("colDate") },
          { key: "po", label: t("colPo") },
          { key: "v", label: t("colVendor") },
          { key: "amt", label: t("colAmount"), className: "text-right tabular-nums" },
        ]}
        rows={rows.map((h) => [h.date, h.po, h.vendor, formatKwd(h.amount, locale)])}
      />
      <ManualPoModal open={modalOpen} onOpenChange={setModalOpen} onCreated={onCreated} />
    </section>
  );
}
