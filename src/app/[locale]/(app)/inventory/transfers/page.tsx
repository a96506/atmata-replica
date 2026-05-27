import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listInternalTransfers } from "@/lib/api/inventory-tx";
import { listWarehouses } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [trxs, warehouses] = await Promise.all([
    listInternalTransfers(),
    listWarehouses(),
  ]);

  return (
    <DocumentList
      title="Internal transfers"
      subtitle="Stock movements between warehouses. Each posts two stock moves (OUT + IN)."
      primaryAction={
        <NewDocButton
          href={`/${locale}/inventory/transfers/new`}
          label="New Transfer"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "date", label: "Date" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          { key: "state", label: "Status" },
        ]}
        rows={trxs.map((t) => {
          const from = warehouses.find((w) => w.id === t.fromWarehouseId);
          const to = warehouses.find((w) => w.id === t.toWarehouseId);
          return [
            <Link
              key="n"
              href={`/${locale}/inventory/transfers/${t.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {t.number}
            </Link>,
            t.date,
            from?.name ?? "—",
            to?.name ?? "—",
            <StateBadge key="s" state={t.state} />,
          ];
        })}
        emptyMessage="No transfers yet."
      />
    </DocumentList>
  );
}
