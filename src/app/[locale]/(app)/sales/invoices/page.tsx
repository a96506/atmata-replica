import { Link } from "@/i18n/navigation";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { RoleHomeActions } from "@/components/app/RoleHomeActions";
import { InvoiceExportClient } from "./invoice-export-client";
import { ListStateFilter } from "@/components/list/ListStateFilter";
import { normalizeListState } from "@/components/list/list-state";
import {
  listCustomerInvoices,
  listCustomerInvoicesPage,
} from "@/lib/api/q2c";
import { mapCustomerNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string; page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("sales");
  const th = await getTranslations("sales.homeActions");
  const sp = await searchParams;
  const stateFilter = normalizeListState(sp.state);
  const { page, limit, offset } = parseListPage(sp);

  const [paged, exportInvs] = await Promise.all([
    listCustomerInvoicesPage({
      limit,
      offset,
      state: stateFilter,
    }),
    // Capped full list for CSV (prior UX). Table uses `paged` only.
    listCustomerInvoices({ state: stateFilter }),
  ]);

  const customerNames = await mapCustomerNamesByIds([
    ...new Set([
      ...paged.items.map((i) => i.customerId),
      ...exportInvs.map((i) => i.customerId),
    ]),
  ]);


  return (
    <DocumentList
      title="Customer invoices"
      subtitle="AR invoices. Saudi-jurisdiction invoices render FATOORA QR."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <InvoiceExportClient
            rows={exportInvs}
            customerNames={Object.fromEntries(customerNames)}
          />
          <RoleHomeActions
            actions={[
              {
                label: th("newInvoice"),
                href: `/${locale}/sales/invoices/new`,
                operation: "create_customer_invoice",
                primary: true,
              },
              {
                label: th("newReceipt"),
                href: `/${locale}/sales/receipts/new`,
                operation: "create_customer_receipt",
              },
              {
                label: th("creditNotes"),
                href: `/${locale}/sales/credit-notes`,
              },
              {
                label: th("creditCheck"),
                href: `/${locale}/settings/customers`,
              },
            ]}
          />
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
        rows={paged.items.map((i) => [
          <Link
            key="n"
            href={`/sales/invoices/${i.id}`}
            className="font-medium text-primary hover:underline"
          >
            {i.number}
          </Link>,
          customerNames.get(i.customerId) ?? "—",
          i.date,
          i.dueDate,
          <span key="t" className="tabular-nums">
            {formatMoney(i.total, i.currency)}
          </span>,
          <span key="b" className="tabular-nums">
            {formatMoney(i.total - i.paid, i.currency)}
          </span>,
          <StateBadge key="s" state={i.state} />,
        ])}
        emptyMessage={t("empty.invoices")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
