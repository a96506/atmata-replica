import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { ToastFromQuery } from "@/components/toast-from-query";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SessionProvider } from "@/lib/session";
import { UserMenu } from "@/components/app/UserMenu";
import { CompanySwitcher } from "@/components/app/CompanySwitcher";
import {
  GlobalSearchProvider,
  GlobalSearchTrigger,
} from "@/components/app/GlobalSearchProvider";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { RoleSwitcher } from "@/components/dev/RoleSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const tc = await getTranslations("chrome");

  const NAV = [
    { href: "/dashboard" as const, label: t("dashboard") },
    { href: "/accounting" as const, label: t("accounting") },
    { href: "/sales" as const, label: t("sales") },
    { href: "/purchasing" as const, label: t("purchasing") },
    { href: "/inventory" as const, label: t("inventory") },
    { href: "/settings" as const, label: t("settings") },
  ];

  return (
    <SessionProvider>
    <ConfirmDialogProvider>
    <GlobalSearchProvider>
      <div className="min-h-screen bg-slate-50">
        <div
          className="border-b border-orange-200 bg-orange-50 px-4 py-2 text-center text-xs font-medium text-orange-900"
          role="status"
        >
          {tc("demoRibbon")}
        </div>

        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
          <div className="flex items-center gap-4 md:gap-6">
            <Link
              href="/inbox"
              className="text-lg font-semibold text-orange-600 transition-colors hover:text-orange-700 md:text-xl"
              aria-label={tc("brand")}
            >
              {tc("brand")}
            </Link>
            <nav
              className="hidden max-w-[52vw] items-center gap-1 overflow-x-auto md:flex lg:max-w-none"
              aria-label="Primary"
            >
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-900 transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <GlobalSearchTrigger />
            <CompanySwitcher label={tc("tenant")} />
            <LocaleSwitcher label={tc("locale")} />
            <NotificationsBell />
            <UserMenu signOutLabel={tc("signOut")} />
          </div>
        </header>

        <nav
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden"
          aria-label="Primary mobile"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="cursor-pointer rounded-md px-3 py-1.5 text-xs whitespace-nowrap text-slate-900 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
        <Suspense fallback={null}>
          <ToastFromQuery />
        </Suspense>
        {process.env.NODE_ENV !== "production" && <RoleSwitcher />}
      </div>
    </GlobalSearchProvider>
    </ConfirmDialogProvider>
    </SessionProvider>
  );
}
