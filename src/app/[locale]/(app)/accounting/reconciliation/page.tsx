import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DemoStartSession } from "./demo-start";
import { ReconTabs } from "./recon-tabs";
import { listBankStatementsPage } from "@/lib/api/reconciliation";
import { parseListPage } from "@/lib/list-paging";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/state/Empty";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const { page, limit, offset } = parseListPage(sp);
  const { items: statements, total } = await listBankStatementsPage({
    limit,
    offset,
    openOnly: true,
  }).catch(() => ({ items: [], total: 0, limit, offset }));
  const t = await getTranslations("accounting.recon");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-foreground">
          {t("subtitle")}
        </p>
      </header>

      <ReconTabs />

      <DemoStartSession />

      {statements.length === 0 && page <= 1 ? (
        <Empty
          title={t("noOpenTitle")}
          description={t("noOpenDescription")}
        />
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t("statementsHeading")}
          </h2>
          <DataTable
            columns={[
              { key: "number", label: t("colNumber") },
              { key: "status", label: t("colStatus") },
              { key: "period", label: t("colPeriod") },
              { key: "created", label: t("colCreated") },
              { key: "open", label: "", className: "text-right" },
            ]}
            rows={statements.map((s) => [
              <span key="n" className="font-medium text-foreground">
                {s.number}
              </span>,
              <span key="st" className="text-xs text-muted-foreground">
                {s.status}
              </span>,
              <span key="p" className="text-xs text-muted-foreground">
                {s.periodStart || s.periodEnd
                  ? t("periodRange", {
                      start: s.periodStart ?? "?",
                      end: s.periodEnd ?? "?",
                    })
                  : "—"}
              </span>,
              <span key="c" className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()}
              </span>,
              <Link
                key="o"
                href={`/accounting/reconciliation/${s.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t("open")}
              </Link>,
            ])}
            emptyMessage={t("emptyStatements")}
            serverPagination={{ page, pageSize: limit, total }}
          />
        </div>
      )}
    </div>
  );
}
