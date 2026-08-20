import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { PageHeader } from "@/components/app/PageHeader";
import { PlatformSignOut } from "@/features/platform-admin/presentation/platform-sign-out";

export async function PlatformShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  const t = await getTranslations("platformAdmin");
  const tc = await getTranslations("chrome");

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 items-center border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4">
          <p className="text-sm font-semibold tracking-tight">{t("brand")}</p>
          <p className="text-muted-foreground hidden text-xs sm:block">{userEmail}</p>
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher label={tc("locale")} />
            <ThemeToggle />
            <PlatformSignOut label={tc("signOut")} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        {children}
      </main>
    </div>
  );
}
