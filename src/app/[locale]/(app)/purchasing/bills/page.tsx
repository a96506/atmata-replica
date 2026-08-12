import { DocumentList } from "@/components/doc/DocumentList";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listVendorBills } from "@/lib/api/p2p";
import { listSuppliers } from "@/lib/api/master";
import { BillListClient } from "./bill-list-client";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [bills, suppliers] = await Promise.all([
    listVendorBills(),
    listSuppliers(),
  ]);

  return (
    <DocumentList
      title="Vendor bills"
      subtitle="3-way match against PO + GRN. Tick posted bills to bulk-pay in one payment."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/bills/new`}
          label="New Bill"
        />
      }
    >
      <BillListClient locale={locale} bills={bills} suppliers={suppliers} />
    </DocumentList>
  );
}
