import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { ToastFromQuery } from "@/components/toast-from-query";
import { SessionProvider } from "@/lib/session";
import { GlobalSearchProvider } from "@/components/app/GlobalSearchProvider";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopBar } from "@/components/app/AppTopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tc = await getTranslations("chrome");

  return (
    <SessionProvider>
      <ConfirmDialogProvider>
        <GlobalSearchProvider>
          <SidebarProvider>
            <AppSidebar brand={tc("brand")} />
            <SidebarInset className="min-w-0">
              <AppTopBar
                signOutLabel={tc("signOut")}
                tenantLabel={tc("tenant")}
                localeLabel={tc("locale")}
              />

              <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {/* Demo notice: previously a full-bleed ribbon above the header,
                    now an inline alert so it scrolls away with the content. */}
                <Alert>
                  <Info />
                  <AlertDescription>{tc("demoRibbon")}</AlertDescription>
                </Alert>

                {children}
              </main>

              <Suspense fallback={null}>
                <ToastFromQuery />
              </Suspense>
            </SidebarInset>
          </SidebarProvider>
        </GlobalSearchProvider>
      </ConfirmDialogProvider>
    </SessionProvider>
  );
}
