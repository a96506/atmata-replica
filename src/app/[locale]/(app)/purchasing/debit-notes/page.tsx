import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { listDebitNotes } from "@/lib/api/returns";
import { listSuppliers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [notes, suppliers] = await Promise.all([listDebitNotes(), listSuppliers()]);

  return (
    <DocumentList
      title="Debit notes"
      subtitle="Auto-generated from Vendor Returns. Settled by netting against a future bill or via refund."
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "vr", label: "From return" },
          { key: "supplier", label: "Supplier" },
          { key: "bill", label: "Applied to" },
          { key: "date", label: "Date" },
          { key: "total", label: "Total" },
          { key: "settled", label: "Settled" },
          { key: "state", label: "Status" },
        ]}
        rows={notes.map((n) => {
          const sup = suppliers.find((s) => s.id === n.supplierId);
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/debit-notes/${n.id}`}
              className="font-medium text-primary hover:underline"
            >
              {n.number}
            </Link>,
            <Link
              key="v"
              href={`/${locale}/purchasing/vendor-returns/${n.vendorReturnId}`}
              className="text-primary hover:underline"
            >
              {n.vendorReturnId}
            </Link>,
            sup?.name ?? "—",
            n.billId ? (
              <Link
                key="b"
                href={`/${locale}/purchasing/bills/${n.billId}`}
                className="text-primary hover:underline"
              >
                {n.billId}
              </Link>
            ) : (
              "—"
            ),
            n.date,
            <span key="t" className="tabular-nums">{formatMoney(n.total, n.currency)}</span>,
            <span key="s" className="tabular-nums">{formatMoney(n.settled, n.currency)}</span>,
            <StateBadge key="st" state={n.state} />,
          ];
        })}
        emptyMessage="No debit notes yet."
      />
    </DocumentList>
  );
}
