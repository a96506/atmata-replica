import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listRfqs } from "@/lib/api/rfq";
import { listSuppliers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [rfqs, suppliers] = await Promise.all([listRfqs(), listSuppliers()]);

  return (
    <DocumentList
      title="Requests for quotation"
      subtitle="Issue an RFQ to multiple suppliers, compare quotes, and award the winning bid."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/rfqs/new`} label="New RFQ" />
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
        rows={rfqs.map((r) => {
          const awarded = r.award
            ? suppliers.find((s) => s.id === r.award!.vendorId)?.name ?? r.award.vendorId
            : "—";
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/rfqs/${r.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {r.number}
            </Link>,
            <span key="p" className="font-mono text-xs text-slate-500">
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
      />
    </DocumentList>
  );
}
