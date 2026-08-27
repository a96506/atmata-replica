import { getLocale, getTranslations } from "next-intl/server";
import { TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "dashboard");
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatKwd } from "@/lib/utils";
import { getDashboardOverview } from "@/lib/api/reports";
import { requestCfoNarrative } from "@/lib/actions/ai";

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  const positive = (delta ?? 0) >= 0;
  const DeltaIcon = positive ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {delta !== undefined ? (
          <p
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              positive
                ? "text-status-success-foreground"
                : "text-destructive",
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden />
            {positive ? "+" : ""}
            {delta.toFixed(1)}% vs last month
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Alert severities map onto the shared status tokens. */
const SEVERITY_TONE: Record<string, string> = {
  high: "bg-status-danger-muted text-status-danger-foreground border-status-danger-border",
  medium:
    "bg-status-pending-muted text-status-pending-foreground border-status-pending-border",
  low: "bg-status-info-muted text-status-info-foreground border-status-info-border",
};

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const { cfo, stats, periodId } = await getDashboardOverview();
  const narrativeResult = periodId
    ? await requestCfoNarrative({ periodId, locale: lk })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("kpiCash")}
          value={formatKwd(cfo.cash_position.current, lk)}
        />
        <KpiCard
          label={t("kpiRevenue")}
          value={formatKwd(cfo.revenue.mtd, lk)}
          delta={cfo.revenue.vs_last_month}
        />
        <KpiCard
          label={t("kpiPending")}
          value={String(stats.pending_approvals ?? 0)}
        />
        <KpiCard
          label={t("kpiSuccess")}
          value={
            stats.success_rate !== undefined
              ? `${(stats.success_rate * 100).toFixed(1)}%`
              : "—"
          }
        />
      </section>

      {narrativeResult?.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("cfoNarrative")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-pretty" dir="auto">
              {narrativeResult.data.narrative}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {cfo.ar_aging.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("arAging")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-end">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cfo.ar_aging.map((row) => (
                    <TableRow key={row.bucket}>
                      <TableCell>{row.bucket}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatKwd(row.amount, lk)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {cfo.alerts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("alerts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {cfo.alerts.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-relaxed"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 capitalize",
                        SEVERITY_TONE[a.severity] ?? SEVERITY_TONE.low,
                      )}
                    >
                      {a.severity}
                    </Badge>
                    <span className="text-pretty">{a.message}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
