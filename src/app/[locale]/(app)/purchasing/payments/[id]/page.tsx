import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getVendorPayment } from "@/lib/api/p2p";
import { getBankAccount, getSupplier } from "@/lib/api/master";
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
  const vpay = await getVendorPayment(id);
  if (!vpay) notFound();
  const [supplier, bank, related, history] = await Promise.all([
    getSupplier(vpay.supplierId),
    getBankAccount(vpay.bankAccountId),
    relatedDocsFor("vendor_payment", vpay.id, locale),
    listAuditEvents("vendor_payment", vpay.id),
  ]);

  const whtRate = supplier?.whtApplicable ? supplier.whtRate ?? 0.05 : 0;
  const whtWithheld = whtRate > 0 ? vpay.amount * whtRate : 0;
  const netPay = vpay.amount - whtWithheld;

  const whtBlock = whtRate > 0 ? (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="font-semibold text-amber-900">
        Withholding tax — {(whtRate * 100).toFixed(0)}%
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-amber-800">Gross</div>
          <div className="font-mono tabular-nums">{formatMoney(vpay.amount, vpay.currency)}</div>
        </div>
        <div>
          <div className="text-amber-800">Withheld</div>
          <div className="font-mono tabular-nums text-red-700">
            −{formatMoney(whtWithheld, vpay.currency)}
          </div>
        </div>
        <div>
          <div className="text-amber-800">Net paid</div>
          <div className="font-mono font-semibold tabular-nums text-emerald-700">
            {formatMoney(netPay, vpay.currency)}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const allocations = (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
          <tr>
            <th className="px-4 py-3">Bill</th>
            <th className="px-4 py-3 text-right">Allocated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {vpay.allocations.map((a) => (
            <tr key={a.billId}>
              <td className="px-4 py-3">
                <Link
                  href={`/${locale}/purchasing/bills/${a.billId}`}
                  className="text-orange-600 hover:underline"
                >
                  {a.billId}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(a.amount, vpay.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DocumentLayout
      number={vpay.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`Paid ${vpay.date} from ${bank?.name ?? "—"} · ${vpay.method}`}
      states={STATES}
      currentState={vpay.state}
      totals={
        <div>
          <div className="text-xs text-slate-500">Amount</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(vpay.amount, vpay.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="vendor_payment"
          docNumber={vpay.number}
          currentState={vpay.state}
          totalLabel={formatMoney(vpay.amount, vpay.currency)}
        />
      }
      tabs={[
        {
          id: "allocations",
          label: "Allocations",
          content: (
            <div className="space-y-3">
              {whtBlock}
              {allocations}
            </div>
          ),
        },
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
