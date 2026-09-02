import { DocumentList } from "@/components/doc/DocumentList";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listPurchaseRequisitionsPage } from "@/lib/api/p2p";
import { parseListPage } from "@/lib/db/read";
import { PrListClient } from "./pr-list-client";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listPurchaseRequisitionsPage({ limit, offset });

  return (
    <DocumentList
      title="Purchase requisitions"
      subtitle="The starting point of every purchase. Adopt a PR into an RFQ or a PO when approved. Tick rows to bulk-adopt into one PO / Bill."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/purchase-requisitions/new`} label="New PR" 
          operation="create_purchase_requisition"/>
      }
    >
      <PrListClient
        locale={locale}
        prs={paged.items}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
