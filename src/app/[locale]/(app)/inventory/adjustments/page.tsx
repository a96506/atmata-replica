import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listStockAdjustments } from "@/lib/api/inventory-tx";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const adjustments = await listStockAdjustments();

  return (
    <DocumentList
      title="Stock adjustments"
      subtitle="Counted-qty corrections with reason codes and approval thresholds."
      primaryAction={
        <NewDocButton
          href={`/${locale}/inventory/adjustments/new`}
          label="New Adjustment"
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
        emptyMessage="No adjustments yet."
      />
    </DocumentList>
  );
}
