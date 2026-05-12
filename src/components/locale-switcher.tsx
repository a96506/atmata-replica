"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">{label}</span>
      <span aria-hidden>{label}</span>
      <select
        className="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value })}
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {loc === "en" ? "English" : "العربية"}
          </option>
        ))}
      </select>
    </label>
  );
}
