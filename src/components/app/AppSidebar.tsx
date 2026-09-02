"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { navigation, stripLocale, type NavModule } from "@/config/navigation";
import { filterNavigation } from "@/lib/roles/nav-filter";
import { useSession } from "@/lib/session";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * Primary navigation. Replaces the former top-nav + horizontal subnav rows.
 *
 * Each module is a collapsible section that auto-opens when the current route
 * falls inside it, so deep links land with their context already expanded.
 * Every route is declared once in `@/config/navigation`.
 */
export function AppSidebar({ brand }: { brand: string }) {
  const pathname = usePathname();
  const path = stripLocale(pathname);
  const locale = useLocale();
  const t = useTranslations("nav");
  const tChrome = useTranslations("chrome");
  const { roles } = useSession();
  const nav = React.useMemo(
    () => filterNavigation(navigation, roles),
    [roles],
  );

  const isActiveLeaf = (href: string) =>
    path === href || path.startsWith(`${href}/`);

  const isActiveModule = (module: NavModule) =>
    path === module.href || path.startsWith(`${module.href}/`);

  const moduleLabel = (module: NavModule) =>
    t.has(module.labelKey ?? module.key)
      ? t(module.labelKey ?? module.key)
      : module.label;

  const leafLabel = (item: { label: string; labelKey?: string }) =>
    item.labelKey && t.has(item.labelKey) ? t(item.labelKey) : item.label;

  const groupLabel = (group: { label?: string; labelKey?: string }) =>
    group.labelKey && t.has(group.labelKey) ? t(group.labelKey) : group.label;

  return (
    <Sidebar collapsible="icon" side={locale === "ar" ? "right" : "left"}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={brand}>
              <Link href="/inbox">
                <span className="bg-primary text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold">
                  A
                </span>
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate font-semibold">{brand}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {tChrome("productSubtitle")}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((module) => {
          // Only single-destination modules (Dashboard) render as a flat link;
          // anything with real children stays collapsible so the module name
          // is never lost from the tree.
          const leafCount = module.groups.reduce(
            (total, group) => total + group.items.length,
            0,
          );
          const isFlat = leafCount <= 1;

          if (isFlat) {
            return (
              <SidebarGroup key={module.key}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {module.groups[0].items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActiveLeaf(item.href)}
                          tooltip={leafLabel(item)}
                        >
                          <Link href={item.href as never}>
                            {item.icon ? <item.icon /> : null}
                            <span>{leafLabel(item)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <SidebarGroup key={module.key}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible
                    defaultOpen={isActiveModule(module)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={moduleLabel(module)}>
                          <module.icon />
                          <span>{moduleLabel(module)}</span>
                          <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180 rtl:group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {module.groups.map((group, groupIndex) => (
                          <React.Fragment key={group.label ?? groupIndex}>
                            {group.label ? (
                              <SidebarGroupLabel className="mt-1 h-6 text-[10px] tracking-wide uppercase">
                                {groupLabel(group)}
                              </SidebarGroupLabel>
                            ) : null}
                            <SidebarMenuSub>
                              {group.items.map((item) => (
                                <SidebarMenuSubItem key={item.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActiveLeaf(item.href)}
                                  >
                                    <Link href={item.href as never}>
                                      {item.icon ? <item.icon /> : null}
                                      <span>{leafLabel(item)}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </React.Fragment>
                        ))}
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {/* Visible only in the mobile off-canvas sheet so Arabic phone users
            can switch language without the (hidden) header control. */}
        <div className="md:hidden">
          <LocaleSwitcher label={t("language")} />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
