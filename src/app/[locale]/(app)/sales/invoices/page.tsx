import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import {
  ListStateFilter,
  normalizeListState,
} from "@/components/list/ListStateFilter";
import { listCustomerInvoices } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { locale } = await params;
  const { state: stateParam } = await searchParams;
  const [allInvs, customers] = await Promise.all([
    listCustomerInvoices(),
    listCustomers(),
  ]);
  const stateFilter = normalizeListState(stateParam);
  const invs = stateFilter ? allInvs.filter((i) => i.state === stateFilter) : allInvs;
  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <DocumentList
      title="Customer invoices"
      subtitle="AR invoices. Saudi-jurisdiction invoices render FATOORA QR."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <ExportCsvButton
            rows={invs}
            filename="customer-invoices"
            columns={[
              { label: "Number", value: (i) => i.number },
              { label: "Customer", value: (i) => customerName(i.customerId) },
              { label: "Date", value: (i) => i.date },
              { label: "Due date", value: (i) => i.dueDate },
              { label: "Currency", value: (i) => i.currency },
              { label: "Total", value: (i) => i.total },
              { label: "Paid", value: (i) => i.paid },
              { label: "Balance", value: (i) => i.total - i.paid },
              { label: "State", value: (i) => i.state },
            ]}
          />
          <NewDocButton href={`/${locale}/sales/invoices/new`} label="New Invoice" />
        </div>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "due", label: "Due" },
          { key: "total", label: "Total", className: "text-right" },
          { key: "balance", label: "Balance", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={invs.map((i) => {
          const cust = customers.find((c) => c.id === i.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/invoices/${i.id}`}
              className="font-medium text-primary hover:underline"
            >
              {i.number}
            </Link>,
            cust?.name ?? "—",
            i.date,
            i.dueDate,
            <span key="t" className="tabular-nums">
              {formatMoney(i.total, i.currency)}
            </span>,
            <span key="b" className="tabular-nums">
              {formatMoney(i.total - i.paid, i.currency)}
            </span>,
            <StateBadge key="s" state={i.state} />,
          ];
        })}
        emptyMessage="No invoices yet."
      />
    </DocumentList>
  );
}
