import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app/AppBreadcrumbs";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserMenu } from "@/components/app/UserMenu";
import { GlobalSearchTrigger } from "@/components/app/GlobalSearchProvider";
import { NotificationsBell } from "@/components/app/NotificationsBell";

/**
 * Slim sticky app bar. Navigation now lives in the sidebar, so this row only
 * carries context (sidebar toggle + breadcrumbs) and global controls.
 */
export function AppTopBar({
  signOutLabel,
  localeLabel,
}: {
  signOutLabel: string;
  localeLabel: string;
}) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b backdrop-blur">
      <div className="flex w-full items-center gap-2 px-3 md:px-4">
        <SidebarTrigger className="-ms-1" />
        <Separator
          orientation="vertical"
          className="me-1 data-[orientation=vertical]:h-4"
        />
        <AppBreadcrumbs />

        <div className="ms-auto flex items-center gap-1 md:gap-2">
          <GlobalSearchTrigger />
          <div className="hidden md:block">
            <LocaleSwitcher label={localeLabel} />
          </div>
          <ThemeToggle />
          <NotificationsBell />
          <UserMenu signOutLabel={signOutLabel} />
        </div>
      </div>
    </header>
  );
}
