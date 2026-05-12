import { getTranslations } from "next-intl/server";
import { DEMO_THRESHOLDS } from "@/lib/demo-data";
import { SettingsDemoTable } from "./settings-demo-form";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const data = DEMO_THRESHOLDS;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-700">{t("subtitle")}</p>
      </header>

      <SettingsDemoTable items={data.items} platformDefaults={data.platform_defaults} />
    </div>
  );
}
