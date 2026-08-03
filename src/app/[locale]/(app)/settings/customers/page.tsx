import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listCustomers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listCustomers();
  return (
    <DocumentList title="Customers" subtitle="Credit limit, exposure, hold flag.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "vat", label: "VAT" },
          { key: "limit", label: "Limit" },
          { key: "exp", label: "Exposure" },
          { key: "pay", label: "Payment" },
          { key: "score", label: "Score" },
        ]}
        rows={rows.map((c) => [
          <Link key="n" href={`/${locale}/settings/customers/${c.id}`} className="font-medium text-primary hover:underline">
            {c.name}
          </Link>,
          c.vatNumber ?? "—",
          c.creditLimit.toLocaleString(),
          c.exposure.toLocaleString(),
          c.paymentStatus,
          c.creditScore,
        ])}
      />
    </DocumentList>
  );
}
