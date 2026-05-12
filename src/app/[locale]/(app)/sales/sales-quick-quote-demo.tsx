"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { formatKwd } from "@/lib/utils";

type Line = { sku: string; label: string; suggested_unit: number; qty: number };

export function SalesQuickQuoteDemo({ products, localeKey }: { products: Line[]; localeKey: "en" | "ar" }) {
  const t = useTranslations("sales.quickQuote");
  const [customer, setCustomer] = useState("kuwait_retail");
  const [exceptional, setExceptional] = useState(false);
  const [lines, setLines] = useState(products);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.suggested_unit * l.qty, 0),
    [lines],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("hint")}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-800">{t("customer")}</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="kuwait_retail">{t("custRetail")}</option>
            <option value="gulf_foods">{t("custFoods")}</option>
            <option value="city_pharma">{t("custPharma")}</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-end gap-2 pb-1 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={exceptional}
            onChange={(e) => setExceptional(e.target.checked)}
            className="size-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          {t("exceptionalTag")}
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-700 uppercase">
            <tr>
              <th className="px-3 py-2">{t("colSku")}</th>
              <th className="px-3 py-2">{t("colProduct")}</th>
              <th className="px-3 py-2 text-right">{t("colSugPrice")}</th>
              <th className="px-3 py-2 text-right">{t("colQty")}</th>
              <th className="px-3 py-2 text-right">{t("colLine")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, i) => (
              <tr key={line.sku}>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{line.sku}</td>
                <td className="px-3 py-2 text-slate-900">{line.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {formatKwd(line.suggested_unit, localeKey)}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                    value={line.qty}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1);
                      setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty: q } : l)));
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                  {formatKwd(line.suggested_unit * line.qty, localeKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          <span className="font-medium">{t("subtotal")}</span>{" "}
          <span className="tabular-nums text-slate-900">{formatKwd(subtotal, localeKey)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
            onClick={() => toast.message(t("toastPdf"))}
          >
            {t("previewPdf")}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            onClick={() =>
              toast.success(
                t("toastSend", {
                  customer: t(
                    customer === "kuwait_retail"
                      ? "custRetail"
                      : customer === "gulf_foods"
                        ? "custFoods"
                        : "custPharma",
                  ),
                  exceptional: exceptional ? t("yes") : t("no"),
                }),
              )
            }
          >
            {t("sendQuote")}
          </button>
        </div>
      </div>
    </div>
  );
}
