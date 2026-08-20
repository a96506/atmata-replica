import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocLines } from "@/components/doc/DocLines";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { CreateChildLinks } from "@/components/doc/CreateChildLinks";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { AdoptToButton } from "@/components/doc/AdoptToButton";
import { CreditHoldBanner, CreditLimitWarning } from "@/components/banners";
import { getSalesOrder, listDeliveryNotes, listCustomerInvoices } from "@/lib/api/q2c";
import { getCustomer, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption.server";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
import { formatMoney } from "@/lib/money";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "posted", label: "Closed" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const so = await getSalesOrder(id);
  if (!so) notFound();
  const [customer, taxCodes, related, history, allDns, allInvs, ancestry, descendants, ai] =
    await Promise.all([
      getCustomer(so.customerId),
      listTaxCodes(),
      relatedDocsFor("so", so.id, locale),
      listAuditEvents("so", so.id),
      listDeliveryNotes(),
      listCustomerInvoices(),
      getAncestry("so", so.id),
      getDescendants("so", so.id),
      getAiSuggestions({ kind: "doc", docType: "so", docId: so.id }),
    ]);

  const dnLinesForThisSo = allDns
    .filter((d) => d.soId === so.id)
    .flatMap((d) => d.lines);
  const invLinesForThisSo = allInvs
    .filter((i) => i.soId === so.id)
    .flatMap((i) => i.lines);
  const linesWithMirrors = so.lines.map((l) => ({
    ...l,
    qtyDelivered: dnLinesForThisSo
      .filter((dl) => dl.soLineId === l.id)
      .reduce((s, dl) => s + dl.qtyDelivered, 0),
    qtyInvoiced: invLinesForThisSo
      .filter((il) => il.soLineId === l.id)
      .reduce((s, il) => s + il.qty, 0),
  }));

  const onCreditHold = customer?.paymentStatus === "on_hold";
  const nearCreditLimit =
    customer && customer.exposure / customer.creditLimit >= 0.9 && !onCreditHold;

  const creditBanner = onCreditHold ? (
    <CreditHoldBanner
      exposure={customer.exposure}
      limit={customer.creditLimit}
    />
  ) : nearCreditLimit ? (
    <CreditLimitWarning
      exposure={customer.exposure}
      limit={customer.creditLimit}
    />
  ) : null;

  return (
    <DocumentLayout
      number={so.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Order date ${so.date} · expected delivery ${so.expectedDeliveryDate}${so.exceptional ? " · exceptional / project" : ""}`}
      states={STATES}
      currentState={so.state}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(so.total, so.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="so"
          docNumber={so.number}
          currentState={so.state}
          totalLabel={formatMoney(so.total, so.currency)}
          blockedReason={so.blockedReason ?? null}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <div className="space-y-4">
              {creditBanner}
              <DocLines
                lines={linesWithMirrors}
                currency={so.currency}
                taxCodes={taxCodes}
                flowedKind="delivered"
              />
            </div>
          ),
        },
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
        attachmentsTab("sales_order", so.id),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "so", docId: so.id }}
            suggestions={ai}
          />
          {!so.blockedReason && (so.state === "confirmed" || so.state === "posted") ? (
            <>
              <AdoptToButton
                mode="single"
                parentType="so"
                parentState={so.state}
                parentId={so.id}
                currency={so.currency}
                locale={locale}
              />
              <CreateChildLinks
                links={[
                  {
                    label: "Deliver",
                    href: `/${locale}/sales/deliveries/new?from=${so.id}`,
                  },
                  {
                    label: "Invoice",
                    href: `/${locale}/sales/invoices/new?from=${so.id}`,
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
