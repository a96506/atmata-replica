import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listRfqsPage } from "@/lib/api/rfq";
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
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listRfqsPage({ limit, offset });
  const awardedVendorIds = paged.items
    .map((r) => r.award?.vendorId)
    .filter((id): id is string => Boolean(id));
  const supplierNames = await mapSupplierNamesByIds(awardedVendorIds);

  return (
    <DocumentList
      title="Requests for quotation"
      subtitle="Issue an RFQ to multiple suppliers, compare quotes, and award the winning bid."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/rfqs/new`} label="New RFQ" 
          operation="create_rfq"/>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "from", label: "From PR" },
          { key: "invited", label: "Invited" },
          { key: "responses", label: "Responses" },
          { key: "date", label: "Date" },
          { key: "state", label: "Status" },
          { key: "award", label: "Awarded to" },
        ]}
        rows={paged.items.map((r) => {
          const awarded = r.award
            ? supplierNames.get(r.award.vendorId) ?? r.award.vendorId
            : "—";
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/rfqs/${r.id}`}
              className="font-medium text-primary hover:underline"
            >
              {r.number}
            </Link>,
            <span key="p" className="font-mono text-xs text-muted-foreground">
              {r.prIds.join(", ") || "—"}
            </span>,
            r.invitedVendorIds.length,
            r.quotes.length,
            r.date,
            <StateBadge key="s" state={r.state} />,
            awarded,
          ];
        })}
        emptyMessage="No RFQs yet."
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
