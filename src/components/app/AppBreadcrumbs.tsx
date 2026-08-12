"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { buildBreadcrumbs } from "@/config/navigation";
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
 * per-page wiring.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
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
