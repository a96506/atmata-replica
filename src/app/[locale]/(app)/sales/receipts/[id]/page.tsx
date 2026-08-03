import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getCustomerReceipt } from "@/lib/api/q2c";
import { getBankAccount, getCustomer } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { formatMoney } from "@/lib/money";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const rcp = await getCustomerReceipt(id);
  if (!rcp) notFound();
  const [customer, bank, related, history] = await Promise.all([
    getCustomer(rcp.customerId),
    getBankAccount(rcp.bankAccountId),
    relatedDocsFor("customer_receipt", rcp.id, locale),
    listAuditEvents("customer_receipt", rcp.id),
  ]);

  const allocations = (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3 text-right">Allocated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rcp.allocations.map((a) => (
            <tr key={a.invoiceId}>
              <td className="px-4 py-3">
                <Link
                  href={`/${locale}/sales/invoices/${a.invoiceId}`}
                  className="text-primary hover:underline"
                >
                  {a.invoiceId}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(a.amount, rcp.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DocumentLayout
      number={rcp.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Received ${rcp.date} into ${bank?.name ?? "—"} · ${rcp.method}`}
      states={STATES}
      currentState={rcp.state}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Amount</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(rcp.amount, rcp.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="customer_receipt"
          docNumber={rcp.number}
          currentState={rcp.state}
          totalLabel={formatMoney(rcp.amount, rcp.currency)}
        />
      }
      tabs={[
        { id: "allocations", label: "Allocations", content: allocations },
        {
          id: "history",
          label: "History",
          content: <HistoryTab events={history} />,
        },
        attachmentsTab(),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}

    />
  );
}
