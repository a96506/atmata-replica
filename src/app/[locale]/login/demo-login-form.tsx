"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function DemoLoginForm() {
  const t = useTranslations("login");
  const router = useRouter();

  return (
    <form
      className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-8 shadow-lg transition-shadow duration-200 hover:shadow-xl"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/inbox");
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-primary">Atmata</h1>
        <p className="text-sm text-foreground">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-foreground">{t("email")}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          defaultValue="demo@atmata.local"
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">{t("password")}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          defaultValue="••••••••"
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </label>

      <button
        type="submit"
        className="w-full cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("submit")}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t("demoHint")}</p>
    </form>
  );
}
