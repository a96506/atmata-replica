import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listSuppliers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listSuppliers();
  return (
    <DocumentList title="Suppliers" subtitle="Bank + tax info · WHT flag.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "vat", label: "VAT" },
          { key: "iban", label: "Bank account" },
          { key: "term", label: "Payment term" },
          { key: "wht", label: "WHT" },
        ]}
        rows={rows.map((s) => [
          <Link key="n" href={`/${locale}/settings/suppliers/${s.id}`} className="font-medium text-orange-600 hover:underline">
            {s.name}
          </Link>,
          s.vatNumber ?? "—",
          <span key="i" className="font-mono text-xs">{s.bankAccount ?? "—"}</span>,
          s.paymentTermId,
          s.whtApplicable ? (
            <span key="w" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {((s.whtRate ?? 0.05) * 100).toFixed(0)}%
            </span>
          ) : (
            "—"
          ),
        ])}
      />
    </DocumentList>
  );
}
