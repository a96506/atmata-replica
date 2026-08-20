import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { getCompany, getCompanyRowCounts } from "@/features/platform-admin/application/queries";
import { CompanyStatusActions } from "@/features/platform-admin/presentation/company-status-actions";
import { RowCounts } from "@/features/platform-admin/presentation/row-counts";
import { KnownActionError } from "@/lib/actions/errors";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const locale = (await getLocale()) as "en" | "ar";
  const t = await getTranslations("platformAdmin");
  try {
    const [company, counts] = await Promise.all([
      getCompany(companyId),
      getCompanyRowCounts(companyId),
    ]);
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{company.name}</CardTitle>
            <Badge variant={company.status === "active" ? "secondary" : "destructive"}>
              {t(`status.${company.status}`)}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>{t("detail.id")}: <span className="font-mono" dir="ltr">{company.id}</span></p>
            <p>{t("detail.plan")}: {company.plan}</p>
            <p>{t("detail.profile")}: {company.taxProfile} / {company.baseCurrency}</p>
            <CompanyStatusActions company={company} locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.members")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "email", label: t("detail.email") },
                { key: "roles", label: t("detail.roles") },
                { key: "owner", label: t("detail.owner") },
              ]}
              rows={company.members.map((member) => [
                member.email,
                member.roles.join(", "),
                member.isOwner ? t("detail.yes") : t("detail.no"),
              ])}
              emptyMessage={t("detail.noMembers")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.invitations")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "email", label: t("detail.email") },
                { key: "status", label: t("list.status") },
                { key: "owner", label: t("detail.owner") },
              ]}
              rows={company.invitations.map((invitation) => [
                invitation.email,
                invitation.status,
                invitation.isOwner ? t("detail.yes") : t("detail.no"),
              ])}
              emptyMessage={t("detail.noInvitations")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.audit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "from", label: t("detail.from") },
                { key: "to", label: t("detail.to") },
                { key: "reason", label: t("detail.reason") },
                { key: "at", label: t("detail.at") },
              ]}
              rows={company.audit.map((event) => [
                event.fromState ?? "—",
                event.toState,
                event.reason ?? "—",
                new Date(event.at).toLocaleString(),
              ])}
              emptyMessage={t("detail.noAudit")}
            />
          </CardContent>
        </Card>
        <RowCounts counts={counts} />
      </div>
    );
  } catch (error) {
    if (error instanceof KnownActionError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
