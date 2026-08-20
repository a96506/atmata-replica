"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import type { PlatformCompanyList } from "../domain/company";

export function CompanyList({
  list,
  search,
  status,
}: {
  list: PlatformCompanyList;
  search: string;
  status: string;
}) {
  const t = useTranslations("platformAdmin");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState(search);
  const [filter, setFilter] = React.useState(status);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filter) params.set("status", filter);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={applyFilters}>
        <div className="min-w-48 flex-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
          />
        </div>
        <select
          className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label={t("list.status")}
        >
          <option value="">{t("list.allStatuses")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="suspended">{t("status.suspended")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("list.filter")}
        </Button>
        <Button asChild>
          <Link href="/platform-admin/new">{t("provision.action")}</Link>
        </Button>
      </form>
      <DataTable
        columns={[
          { key: "name", label: t("list.name") },
          { key: "status", label: t("list.status"), sortable: false },
          { key: "plan", label: t("list.plan") },
          { key: "created", label: t("list.created") },
        ]}
        emptyMessage={t("list.empty")}
        rows={list.items.map((company) => [
          <Link
            key={company.id}
            href={`/platform-admin/${company.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {company.name}
          </Link>,
          <Badge
            key={`${company.id}-status`}
            variant={company.status === "active" ? "secondary" : "destructive"}
          >
            {t(`status.${company.status}`)}
          </Badge>,
          company.plan,
          new Date(company.createdAt).toLocaleDateString(),
        ])}
      />
      <p className="text-muted-foreground text-xs">
        {t("list.total", { count: list.total })}
      </p>
    </div>
  );
}
