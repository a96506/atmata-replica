import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listStockAdjustmentsPage } from "@/lib/api/inventory-tx";
import { parseListPage } from "@/lib/db/read";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("inventory");
  const { page, limit, offset } = parseListPage(await searchParams);

  const { items: adjustments, total } = await listStockAdjustmentsPage({
    limit,
    offset,
  });

  return (
    <DocumentList
      title="Stock adjustments"
      subtitle="Counted-qty corrections with reason codes and approval thresholds."
      primaryAction={
        <NewDocButton
          href={`/${locale}/inventory/adjustments/new`}
          label="New Adjustment"
          operation="create_stock_adjustment"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "date", label: "Date" },
          { key: "lines", label: "Lines" },
          { key: "delta", label: "Net Δqty", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={adjustments.map((a) => {
          const netDelta = a.lines.reduce((s, l) => s + l.qtyDelta, 0);
          return [
            <Link
              key="n"
              href={`/${locale}/inventory/adjustments/${a.id}`}
              className="font-medium text-primary hover:underline"
            >
              {a.number}
            </Link>,
            a.date,
            a.lines.length,
            <span
              key="d"
              className={
                "tabular-nums " +
                (netDelta < 0 ? "text-destructive" : netDelta > 0 ? "text-status-success-foreground" : "")
              }
            >
              {netDelta > 0 ? "+" : ""}
              {netDelta}
            </span>,
            <StateBadge key="s" state={a.state} />,
          ];
        })}
        emptyMessage={t("empty.adjustments")}
        serverPagination={{ page, pageSize: limit, total }}
      />
    </DocumentList>
  );
}
