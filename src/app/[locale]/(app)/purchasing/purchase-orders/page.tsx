import { DocumentList } from "@/components/doc/DocumentList";
import { RoleHomeActions } from "@/components/app/RoleHomeActions";
import { listPurchaseOrdersPage } from "@/lib/api/p2p";
import { mapSupplierNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { PoListClient } from "./po-list-client";
import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "purchase_orders");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const th = await getTranslations("purchasing.homeActions");
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listPurchaseOrdersPage({ limit, offset });
  const supplierNames = await mapSupplierNamesByIds([
    ...new Set(paged.items.map((po) => po.supplierId)),
  ]);

  return (
    <DocumentList
      title="Purchase orders"
      subtitle="Procure-to-pay · POs and their downstream chain. Tick rows to bulk-adopt into GRN / Bill / Payment."
      primaryAction={
        <RoleHomeActions
          actions={[
            {
              label: th("newPo"),
              href: `/${locale}/purchasing/purchase-orders/new`,
              operation: "create_purchase_order",
              primary: true,
            },
            {
              label: th("newRfq"),
              href: `/${locale}/purchasing/rfqs/new`,
              operation: "create_rfq",
            },
            {
              label: th("reorderAlerts"),
              href: `/${locale}/inventory`,
            },
          ]}
        />
      }
    >
      <PoListClient
        locale={locale}
        pos={paged.items}
        supplierNames={Object.fromEntries(supplierNames)}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
