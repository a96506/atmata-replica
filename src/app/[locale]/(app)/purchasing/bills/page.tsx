import { DocumentList } from "@/components/doc/DocumentList";
import { RoleHomeActions } from "@/components/app/RoleHomeActions";
import {
  ListStateFilter,
  normalizeListState,
} from "@/components/list/ListStateFilter";
import { listVendorBills, listVendorBillsPage } from "@/lib/api/p2p";
import { mapSupplierNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { BillListClient } from "./bill-list-client";
import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "vendor_bills");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string; page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const th = await getTranslations("purchasing.homeActions");
  const sp = await searchParams;
  const stateFilter = normalizeListState(sp.state);
  const { page, limit, offset } = parseListPage(sp);

  const [paged, exportBills] = await Promise.all([
    listVendorBillsPage({
      limit,
      offset,
      state: stateFilter,
    }),
    // Capped full list for CSV (prior UX). Table uses `paged` only.
    listVendorBills({ state: stateFilter }),
  ]);

  const pageSupplierIds = paged.items.map((b) => b.supplierId);
  const exportSupplierIds = [
    ...new Set([
      ...pageSupplierIds,
      ...exportBills.map((b) => b.supplierId),
    ]),
  ];
  const supplierNames = await mapSupplierNamesByIds(exportSupplierIds);

  return (
    <DocumentList
      title="Vendor bills"
      subtitle="3-way match against PO + GRN. Tick posted bills to bulk-pay in one payment."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <RoleHomeActions
            actions={[
              {
                label: th("scanPdf"),
                href: `/${locale}/purchasing/scan`,
              },
              {
                label: th("newBill"),
                href: `/${locale}/purchasing/bills/new`,
                operation: "create_vendor_bill",
                primary: true,
              },
              {
                label: th("billFromGrn"),
                href: `/${locale}/purchasing/goods-receipts`,
              },
            ]}
          />
        </div>
      }
    >
      <BillListClient
        locale={locale}
        bills={paged.items}
        exportBills={exportBills}
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
