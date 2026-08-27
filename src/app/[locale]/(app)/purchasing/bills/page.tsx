import { DocumentList } from "@/components/doc/DocumentList";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import {
  ListStateFilter,
  normalizeListState,
} from "@/components/list/ListStateFilter";
import { listVendorBills } from "@/lib/api/p2p";
import { listSuppliers } from "@/lib/api/master";
import { BillListClient } from "./bill-list-client";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "vendor_bills");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { locale } = await params;
  const { state: stateParam } = await searchParams;
  const [allBills, suppliers] = await Promise.all([
    listVendorBills(),
    listSuppliers(),
  ]);
  const stateFilter = normalizeListState(stateParam);
  const bills = stateFilter ? allBills.filter((b) => b.state === stateFilter) : allBills;

  return (
    <DocumentList
      title="Vendor bills"
      subtitle="3-way match against PO + GRN. Tick posted bills to bulk-pay in one payment."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <NewDocButton
            href={`/${locale}/purchasing/bills/new`}
            label="New Bill"
          />
        </div>
      }
    >
      <BillListClient locale={locale} bills={bills} suppliers={suppliers} />
    </DocumentList>
  );
}
