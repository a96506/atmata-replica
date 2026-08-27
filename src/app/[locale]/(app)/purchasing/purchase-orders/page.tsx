import { DocumentList } from "@/components/doc/DocumentList";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listPurchaseOrders } from "@/lib/api/p2p";
import { listSuppliers } from "@/lib/api/master";
import { PoListClient } from "./po-list-client";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "purchase_orders");

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [pos, suppliers] = await Promise.all([
    listPurchaseOrders(),
    listSuppliers(),
  ]);

  return (
    <DocumentList
      title="Purchase orders"
      subtitle="Procure-to-pay · POs and their downstream chain. Tick rows to bulk-adopt into GRN / Bill / Payment."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/purchase-orders/new`}
          label="New PO"
        />
      }
    >
      <PoListClient locale={locale} pos={pos} suppliers={suppliers} />
    </DocumentList>
  );
}
