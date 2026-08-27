import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { ToastFromQuery } from "@/components/toast-from-query";
import { SessionProvider } from "@/lib/session";
import { GlobalSearchProvider } from "@/components/app/GlobalSearchProvider";
import { BreadcrumbOverrideProvider } from "@/components/app/BreadcrumbOverride";
import { FiscalPeriodsProvider } from "@/components/form/FiscalPeriodsContext";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopBar } from "@/components/app/AppTopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAppSession, getPlatformAdminGate } from "@/lib/insforge/session";
import { listFiscalPeriods } from "@/lib/api/master";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { session, reason } = await getAppSession();
  if (!session) {
    if (reason === "no_company" || reason === "suspended") {
      const platform = await getPlatformAdminGate();
      if (platform.reason === null) {
        redirect(`/${locale}/platform-admin`);
      }
    }
    const suffix = reason && reason !== "unauthenticated" ? `?error=${reason}` : "";
    redirect(`/${locale}/login${suffix}`);
  }

  const tc = await getTranslations("chrome");

  // Real fiscal calendar so every form's period lock reflects the live DB
  // rather than a mock. Failures degrade to an empty calendar (everything
  // resolves to `no_period`) instead of blocking the whole app.
  const fiscalPeriods = await listFiscalPeriods().catch(() => []);

  return (
    <SessionProvider session={session}>
      <FiscalPeriodsProvider periods={fiscalPeriods}>
        <ConfirmDialogProvider>
          <GlobalSearchProvider>
          <BreadcrumbOverrideProvider>
          <SidebarProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:outline focus:outline-2 focus:outline-primary"
            >
              {tc("skipToContent")}
            </a>
            <AppSidebar brand={tc("brand")} />
            <SidebarInset id="main-content" className="min-w-0">
              <AppTopBar
                signOutLabel={tc("signOut")}
                localeLabel={tc("locale")}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {children}
              </div>

              <Suspense fallback={null}>
                <ToastFromQuery />
              </Suspense>
            </SidebarInset>
          </SidebarProvider>
          </BreadcrumbOverrideProvider>
          </GlobalSearchProvider>
        </ConfirmDialogProvider>
      </FiscalPeriodsProvider>
    </SessionProvider>
  );
}
