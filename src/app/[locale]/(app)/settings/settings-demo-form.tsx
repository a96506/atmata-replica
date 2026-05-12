"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import type { DemoThresholdRow } from "./types";

export function SettingsDemoTable({ items, platformDefaults }: { items: DemoThresholdRow[]; platformDefaults: { default_threshold: number; auto_approve_threshold: number } }) {
  const t = useTranslations("settings");

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-700 uppercase">
          <tr>
            <th className="px-4 py-2">{t("automation")}</th>
            <th className="px-4 py-2">{t("defaultThreshold")}</th>
            <th className="px-4 py-2">{t("autoThreshold")}</th>
            <th className="px-4 py-2">{t("source")}</th>
            <th className="px-4 py-2 text-right">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.automation_type} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">{row.automation_type}</td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  defaultValue={row.default_threshold}
                  className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  defaultValue={row.auto_approve_threshold}
                  className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </td>
              <td className="px-4 py-2">
                {row.is_default ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{t("platform")}</span>
                ) : (
                  <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
                    {t("tenantOverride")}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  className="mr-2 cursor-pointer rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700"
                  onClick={() => toast.success(`${t("save")} · ${row.automation_type} (demo)`)}
                >
                  {t("save")}
                </button>
                {!row.is_default && (
                  <button
                    type="button"
                    className="cursor-pointer text-xs text-slate-700 hover:text-red-600"
                    onClick={() => toast.message(`${t("reset")} · ${row.automation_type} (demo)`)}
                  >
                    {t("reset")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        Platform defaults: approval ≥ {platformDefaults.default_threshold}, auto-execute ≥{" "}
        {platformDefaults.auto_approve_threshold}.
      </p>
    </div>
  );
}
