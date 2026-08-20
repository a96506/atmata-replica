import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocLines } from "@/components/doc/DocLines";
import { StateBadge } from "@/components/doc/StateBadge";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { CreateChildLinks } from "@/components/doc/CreateChildLinks";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { AdoptToButton } from "@/components/doc/AdoptToButton";
import {
  getGoodsReceipt,
  getPurchaseOrder,
  getVendorBill,
} from "@/lib/api/p2p";
import { getSupplier, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption.server";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
import { DocPdfActions } from "@/components/doc/DocPdfActions";
import { formatMoney } from "@/lib/money";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const bill = await getVendorBill(id);
  if (!bill) notFound();
  const [supplier, po, grn, taxCodes, related, history, ancestry, descendants, ai] =
    await Promise.all([
      getSupplier(bill.supplierId),
      bill.poId ? getPurchaseOrder(bill.poId) : Promise.resolve(null),
      bill.grnId ? getGoodsReceipt(bill.grnId) : Promise.resolve(null),
      listTaxCodes(),
      relatedDocsFor("vendor_bill", bill.id, locale),
      listAuditEvents("vendor_bill", bill.id),
      getAncestry("vendor_bill", bill.id),
      getDescendants("vendor_bill", bill.id),
      getAiSuggestions({ kind: "doc", docType: "vendor_bill", docId: bill.id }, locale === "ar" ? "ar" : "en"),
    ]);

  const balance = bill.total - bill.paid;

  const matchPanel = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">3-way match</span>
        <StateBadge state={bill.threeWayMatch} />
      </div>
      {bill.discrepancyReason ? (
        <div className="rounded-md border border-status-danger-border bg-status-danger-muted p-3 text-sm text-destructive">
          {bill.discrepancyReason}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">PO qty</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Billed</th>
              <th className="px-4 py-3 text-right">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bill.lines.map((l) => {
              const poLine = po?.lines.find((p) => p.id === l.poLineId);
              const grnLine = grn?.lines.find((g) => g.id === l.grnLineId);
              const billed = l.qty;
              const received = grnLine?.qtyReceived ?? 0;
              const ordered = poLine?.qty ?? 0;
              const delta = billed - received;
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{ordered}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{received}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{billed}</td>
                  <td
                    className={
                      "px-4 py-3 text-right tabular-nums " +
                      (delta === 0 ? "text-status-success-foreground" : "text-destructive")
                    }
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <DocumentLayout
      number={bill.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`Vendor inv ${bill.invoiceNumber} · ${bill.date} · due ${bill.dueDate}`}
      states={STATES}
      currentState={bill.state}
      actions={<DocPdfActions docType="vendor_bill" docId={bill.id} locale={locale} />}
      totals={
        <div className="space-y-1">
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatMoney(bill.total, bill.currency)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Paid <span className="tabular-nums">{formatMoney(bill.paid, bill.currency)}</span>
            {" · "}Balance{" "}
            <span className="tabular-nums">{formatMoney(balance, bill.currency)}</span>
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="vendor_bill"
          docNumber={bill.number}
          currentState={bill.state}
          totalLabel={`${bill.currency} ${bill.total.toFixed(3)}`}
          blockedReason={
            bill.threeWayMatch === "discrepancy"
              ? `3-way match discrepancy: ${bill.discrepancyReason ?? "qty / price out of tolerance"} — requires approver override.`
              : null
          }
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines lines={bill.lines} currency={bill.currency} taxCodes={taxCodes} />
          ),
        },
        { id: "match", label: "3-way match", content: matchPanel },
        {
          id: "adoption",
          label: "Adoption",
          content: (
            <AdoptionTrail locale={locale} ancestry={ancestry} descendants={descendants} />
          ),
        },
        {
          id: "history",
          label: "History",
          content: <HistoryTab events={history} />,
        },
        attachmentsTab("vendor_bill", bill.id),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "vendor_bill", docId: bill.id }}
            suggestions={ai}
          />
          {bill.state === "posted" && bill.paid < bill.total ? (
            <>
              <AdoptToButton
                mode="single"
                parentType="vendor_bill"
                parentState={bill.state}
                parentId={bill.id}
                currency={bill.currency}
                locale={locale}
              />
              <CreateChildLinks
                links={[
                  {
                    label: "Payment",
                    href: `/${locale}/purchasing/payments/new?from=${bill.id}`,
                  },
                ]}
              />
            </>
          ) : null}
          <RelatedDocs groups={related} />
        </div>
      }
      loadedAt={new Date().toISOString()}

    />
  );
}
