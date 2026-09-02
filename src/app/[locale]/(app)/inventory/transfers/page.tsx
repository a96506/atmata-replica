import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listInternalTransfersPage } from "@/lib/api/inventory-tx";
import {
  getReadClient,
  mapRows,
  parseListPage,
  requireData,
} from "@/lib/db/read";
import { MASTER_SELECTS } from "@/lib/db/selects";
import type { Warehouse } from "@/types";

async function warehousesByIds(ids: string[]): Promise<Map<string, Warehouse>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  const result = await client.database
    .from("warehouses")
    .select(MASTER_SELECTS.warehouses)
    .in("id", unique);
  const rows = mapRows<Warehouse>(requireData(result, "warehouses by id"));
  return new Map(rows.map((w) => [w.id, w]));
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const { page, limit, offset } = parseListPage(await searchParams);

  const { items: trxs, total } = await listInternalTransfersPage({ limit, offset });
  const warehouses = await warehousesByIds(
    trxs.flatMap((t) => [t.fromWarehouseId, t.toWarehouseId]),
  );

  return (
    <DocumentList
      title="Internal transfers"
      subtitle="Stock movements between warehouses. Each posts two stock moves (OUT + IN)."
      primaryAction={
        <NewDocButton
          href={`/${locale}/inventory/transfers/new`}
          label="New Transfer"
          operation="create_internal_transfer"
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
          const from = warehouses.get(t.fromWarehouseId);
          const to = warehouses.get(t.toWarehouseId);
          return [
            <Link
              key="n"
              href={`/${locale}/inventory/transfers/${t.id}`}
              className="font-medium text-primary hover:underline"
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
        serverPagination={{ page, pageSize: limit, total }}
      />
    </DocumentList>
  );
}
