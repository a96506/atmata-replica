"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { buildBreadcrumbs } from "@/config/navigation";
import { useBreadcrumbLabel } from "@/components/app/BreadcrumbOverride";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * Derives the trail from the central nav config, so record pages like
 * `/sales/invoices/inv_1` read "Sales / Customer invoices / inv_1" without any
 * per-page wiring. Detail pages can publish a human-readable label (e.g. the
 * document number) via `BreadcrumbOverrideProvider` to replace the raw record
 * id that would otherwise appear in the last crumb.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);
  const overrideLabel = useBreadcrumbLabel(pathname);

  if (crumbs.length === 0) return null;

  const finalCrumbs = crumbs.map((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    if (isLast && overrideLabel != null) {
      return { ...crumb, label: overrideLabel };
    }
    return crumb;
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {finalCrumbs.map((crumb, index) => {
          const isLast = index === finalCrumbs.length - 1;
          return (
            <React.Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem
                className={index === 0 ? "hidden sm:block" : undefined}
              >
                {isLast || !crumb.href ? (
                  <BreadcrumbPage className="max-w-[24ch] truncate font-mono text-xs sm:max-w-none sm:font-sans sm:text-sm">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href as never}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? (
                <BreadcrumbSeparator
                  className={
                    index === 0
                      ? "hidden sm:block rtl:rotate-180"
                      : "rtl:rotate-180"
                  }
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
