import { DocumentList } from "@/components/doc/DocumentList";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listPurchaseRequisitions } from "@/lib/api/p2p";
import { PrListClient } from "./pr-list-client";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const prs = await listPurchaseRequisitions();

  return (
    <DocumentList
      title="Purchase requisitions"
      subtitle="The starting point of every purchase. Adopt a PR into an RFQ or a PO when approved. Tick rows to bulk-adopt into one PO / Bill."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/purchase-requisitions/new`} label="New PR" />
      }
    >
      <PrListClient locale={locale} prs={prs} />
    </DocumentList>
  );
}
