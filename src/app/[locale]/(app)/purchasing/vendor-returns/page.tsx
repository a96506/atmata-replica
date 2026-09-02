import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listVendorReturnsPage } from "@/lib/api/returns";
import { mapSupplierNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("purchasing");
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listVendorReturnsPage({ limit, offset });
  const supplierNames = await mapSupplierNamesByIds([
    ...new Set(paged.items.map((v) => v.supplierId)),
  ]);

  return (
    <DocumentList
      title="Vendor returns"
      subtitle="Reverse a received shipment. A Debit Note is generated on post and applied against the source bill."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/vendor-returns/new`} label="New return" 
          operation="create_vendor_return"/>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "from", label: "From GRN" },
          { key: "supplier", label: "Supplier" },
          { key: "date", label: "Date" },
          { key: "qty", label: "Lines" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((v) => [
          <Link
            key="n"
            href={`/purchasing/vendor-returns/${v.id}`}
            className="font-medium text-primary hover:underline"
          >
            {v.number}
          </Link>,
          <Link
            key="g"
            href={`/purchasing/goods-receipts/${v.grnId}`}
            className="text-primary hover:underline"
          >
            {v.grnId}
          </Link>,
          supplierNames.get(v.supplierId) ?? "—",
          v.date,
          v.lines.length,
          <StateBadge key="s" state={v.state} />,
        ])}
        emptyMessage={t("empty.vendorReturns")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
