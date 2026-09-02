"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export const SALES_OVERVIEW_TABS = [
  "quotes",
  "orders",
  "customers",
  "pipeline",
] as const;

export type SalesOverviewTab = (typeof SALES_OVERVIEW_TABS)[number];

export function parseSalesOverviewTab(
  raw: string | undefined,
): SalesOverviewTab {
  if (raw && SALES_OVERVIEW_TABS.includes(raw as SalesOverviewTab)) {
    return raw as SalesOverviewTab;
  }
  return "quotes";
}

type SalesOverviewTabsProps = {
  activeTab: SalesOverviewTab;
  children: React.ReactNode;
};

/** Tabs synced to `?tab=` (default quotes). Pagination keeps other searchParams. */
export function SalesOverviewTabs({
  activeTab,
  children,
}: SalesOverviewTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onValueChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "quotes") params.delete("tab");
    else params.set("tab", value);
    params.delete("page");
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  }

  return (
    <Tabs value={activeTab} onValueChange={onValueChange}>
      {children}
    </Tabs>
  );
}
