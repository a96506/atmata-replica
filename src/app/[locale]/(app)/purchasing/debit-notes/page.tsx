import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { listDebitNotesPage } from "@/lib/api/returns";
import { mapSupplierNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("purchasing");
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listDebitNotesPage({ limit, offset });
  const supplierNames = await mapSupplierNamesByIds([
    ...new Set(paged.items.map((n) => n.supplierId)),
  ]);

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
        rows={paged.items.map((n) => [
          <Link
            key="n"
            href={`/purchasing/debit-notes/${n.id}`}
            className="font-medium text-primary hover:underline"
          >
            {n.number}
          </Link>,
          <Link
            key="v"
            href={`/purchasing/vendor-returns/${n.vendorReturnId}`}
            className="text-primary hover:underline"
          >
            {n.vendorReturnId}
          </Link>,
          supplierNames.get(n.supplierId) ?? "—",
          n.billId ? (
            <Link
              key="b"
              href={`/purchasing/bills/${n.billId}`}
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
        ])}
        emptyMessage={t("empty.debitNotes")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
