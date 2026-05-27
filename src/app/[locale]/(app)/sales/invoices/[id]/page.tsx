import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocLines } from "@/components/doc/DocLines";
import { FatooraQrPlaceholder } from "@/components/doc/FatooraQr";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { CreateChildLinks } from "@/components/doc/CreateChildLinks";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { AdoptToButton } from "@/components/doc/AdoptToButton";
import { SaudiInvoicePrintButton } from "./print-button";
import { getCustomerInvoice } from "@/lib/api/q2c";
import { getCompany, getCustomer, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
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
  const inv = await getCustomerInvoice(id);
  if (!inv) notFound();
  const [customer, company, taxCodes, related, history, ancestry, descendants, ai] =
    await Promise.all([
      getCustomer(inv.customerId),
      getCompany(inv.companyId),
      listTaxCodes(),
      relatedDocsFor("customer_invoice", inv.id, locale),
      listAuditEvents("customer_invoice", inv.id),
      getAncestry("customer_invoice", inv.id),
      getDescendants("customer_invoice", inv.id),
      getAiSuggestions({ kind: "doc", docType: "customer_invoice", docId: inv.id }),
    ]);

  const balance = inv.total - inv.paid;
  const isSaudi = company?.taxProfile === "SA";

  return (
    <DocumentLayout
      number={inv.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Issued ${inv.date} · due ${inv.dueDate}`}
      states={STATES}
      currentState={inv.state}
      totals={
        <div className="space-y-1">
          <div>
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatMoney(inv.total, inv.currency)}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Paid <span className="tabular-nums">{formatMoney(inv.paid, inv.currency)}</span>
            {" · "}Balance{" "}
            <span className="tabular-nums">{formatMoney(balance, inv.currency)}</span>
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="customer_invoice"
          docNumber={inv.number}
          currentState={inv.state}
          totalLabel={formatMoney(inv.total, inv.currency)}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <div className="space-y-4">
              {isSaudi ? (
                <FatooraQrPlaceholder
                  invoice={inv}
                  sellerVat={company?.vatNumber ?? ""}
                />
              ) : null}
              <DocLines lines={inv.lines} currency={inv.currency} taxCodes={taxCodes} />
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
        attachmentsTab(),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "customer_invoice", docId: inv.id }}
            suggestions={ai}
          />
          {isSaudi && company ? (
            <SaudiInvoicePrintButton
              invoice={inv}
              company={company}
              customer={customer}
            />
          ) : null}
          {inv.state === "posted" && inv.paid < inv.total ? (
            <>
              <AdoptToButton
                mode="single"
                parentType="customer_invoice"
                parentState={inv.state}
                parentId={inv.id}
                currency={inv.currency}
                locale={locale}
              />
              <CreateChildLinks
                links={[
                  {
                    label: "Receipt",
                    href: `/${locale}/sales/receipts/new?from=${inv.id}`,
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
