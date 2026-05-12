"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function DemoLoginForm() {
  const t = useTranslations("login");
  const router = useRouter();

  return (
    <form
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg transition-shadow duration-200 hover:shadow-xl"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/inbox");
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-orange-600">Atmata</h1>
        <p className="text-sm text-slate-700">{t("title")}</p>
        <p className="text-xs text-slate-500">{t("subtitle")}</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-800">{t("email")}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          defaultValue="demo@atmata.local"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-800">{t("password")}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          defaultValue="••••••••"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        className="w-full cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow transition-colors duration-200 hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
      >
        {t("submit")}
      </button>
      <p className="text-center text-xs text-slate-500">{t("demoHint")}</p>
    </form>
  );
}
