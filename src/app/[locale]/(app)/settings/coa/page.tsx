import { getTranslations } from "next-intl/server";

import { type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listAccounts } from "@/lib/api/gl";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/master";

const TYPE_ORDER: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  revenue: 4,
  expense: 5,
};

const ACCOUNT_TYPE_KEYS = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;

function typeBadge(type: string, label: string) {
  const cls =
    type === "asset"
      ? "bg-status-success-muted text-status-success-foreground"
      : type === "liability"
        ? "bg-status-danger-muted text-destructive"
        : type === "equity"
          ? "bg-status-info-muted text-status-info-foreground"
          : type === "revenue"
            ? "bg-status-info-muted text-status-info-foreground"
            : "bg-status-pending-muted text-status-pending-foreground";
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + cls}>
      {label}
    </span>
  );
}

function displayName(a: { name: string; nameEn?: string | null; nameAr?: string | null }) {
  return a.nameEn?.trim() || a.name;
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings.coa");
  const accounts = await listAccounts();
  const rows = accounts.slice().sort((a, b) => {
    const order = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (order !== 0) return order;
    return a.code.localeCompare(b.code);
  });

  const byId = new Map(rows.map((a) => [a.id, a]));

  const typeLabel = (type: string) =>
    ACCOUNT_TYPE_KEYS.includes(type as (typeof ACCOUNT_TYPE_KEYS)[number])
      ? t(`types.${type}` as "types.asset")
      : type;

  const accountTypes = ACCOUNT_TYPE_KEYS.map((value) => ({
    value,
    label: t(`types.${value}`),
  }));

  const parentOptions = rows.map((a) => ({
    value: a.id,
    label: `${a.code} · ${displayName(a)}`,
    hint: typeLabel(a.type),
  }));

  const columns: Column[] = [
    { key: "code", label: t("code") },
    { key: "nameEn", label: t("nameEn") },
    { key: "nameAr", label: t("nameAr") },
    { key: "type", label: t("type") },
    { key: "parent", label: t("parent") },
    { key: "active", label: t("active") },
  ];

  const fields: MasterField[] = [
    {
      name: "code",
      label: t("code"),
      type: "text",
      required: true,
      placeholder: t("codePlaceholder"),
    },
    { name: "nameEn", label: t("nameEn"), type: "text", required: true },
    { name: "nameAr", label: t("nameAr"), type: "text", required: true },
    {
      name: "type",
      label: t("type"),
      type: "select",
      required: true,
      options: accountTypes,
    },
    {
      name: "parent",
      label: t("parentAccount"),
      type: "searchSelect",
      options: parentOptions,
      help: t("parentHelp"),
    },
    { name: "active", label: t("active"), type: "boolean" },
  ];

  const entities = rows.map((a) => ({
    id: a.id,
    code: a.code,
    nameEn: a.nameEn ?? "",
    nameAr: a.nameAr ?? "",
    type: a.type,
    parent: a.parent ?? "",
    active: a.active ?? true,
  }));

  const tableRows = rows.map((a) => {
    const parent = a.parent ? byId.get(a.parent) : undefined;
    return [
      <span key="c" className="font-mono text-xs">{a.code}</span>,
      a.nameEn ?? a.name,
      a.nameAr ?? "—",
      typeBadge(a.type, typeLabel(a.type)),
      parent ? `${parent.code} · ${displayName(parent)}` : "—",
      a.active === false ? t("no") : t("yes"),
    ];
  });

  return (
    <MasterCrud
      locale={locale}
      entityLabel={t("entity")}
      title={t("title")}
      subtitle={t("subtitle")}
      columns={columns}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createAccountAction}
      onUpdate={updateAccountAction}
      onDelete={deleteAccountAction}
      writeOperation="create_account"
    />
  );
}
