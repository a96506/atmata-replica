import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PackageX } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInventoryOverview } from "@/lib/api/inventory-overview";
import { pageMetadata } from "@/lib/metadata";
import { getAppSession } from "@/lib/insforge/session";
import { deferredMessageKey } from "@/lib/deferred-empty";
import {
  InventoryDemoToolbar,
  ShipmentNoteDemo,
} from "./inventory-demo-actions";

export const generateMetadata = pageMetadata("nav", "inventory");

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

// A / B / C are distinct classes, so each needs its own visual weight —
// previously B and C rendered identically.
function AbcBadge({ abc }: { abc: "A" | "B" | "C" }) {
  const tone =
    abc === "A"
      ? "bg-primary/10 text-primary border-primary/30"
      : abc === "B"
        ? "bg-status-info-muted text-status-info-foreground border-status-info-border"
        : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={tone} title={`ABC class ${abc}`}>
      {`ABC · ${abc}`}
    </Badge>
  );
}

export default async function InventoryPage() {
  const locale = await getLocale();
  const t = await getTranslations("inventory");
  const td = await getTranslations("deferred");
  const { session } = await getAppSession();
  const deferredKey = session
    ? deferredMessageKey(session.role, session.roles)
    : "comingSoonGeneric";
  const d = await getInventoryOverview();

  const critical = d.reorder_alerts.filter((a) => a.severity === "critical");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<InventoryDemoToolbar />}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label={t("secReorder")} value={d.reorder_alerts.length} />
        <Kpi label={t("secInbound")} value={d.inbound.length} />
        <Kpi label={t("secOutbound")} value={d.outbound.length} />
      </section>

      {d.reorder_alerts.length > 0 ? (
        <Alert variant={critical.length > 0 ? "destructive" : "default"}>
          <PackageX />
          <AlertTitle>{t("secReorder")}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {d.reorder_alerts.map((a) => (
                <li
                  key={a.sku}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                >
                  <span>
                    <span className="font-medium">{a.name}</span>{" "}
                    <span className="font-mono text-xs opacity-80">{`(${a.sku})`}</span>{" "}
                    — {t("reorderShort", { n: a.short_by })} ·{" "}
                    <span className="uppercase">{t(`severity.${a.severity}`)}</span>
                  </span>
                  <span className="inline-flex gap-2 text-xs">
                    <Link
                      href={`/${locale}/purchasing/purchase-requisitions/new?sku=${encodeURIComponent(a.sku)}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Create PR
                    </Link>
                    <Link
                      href={`/${locale}/purchasing/purchase-orders/new?sku=${encodeURIComponent(a.sku)}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Create PO
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Four tables share one surface via tabs so the overview stays a single
          screen instead of four stacked sections. */}
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{t("secStock")}</TabsTrigger>
          <TabsTrigger value="forecast">{t("secForecast")}</TabsTrigger>
          <TabsTrigger value="inbound">{t("secInbound")}</TabsTrigger>
          <TabsTrigger value="outbound">{t("secOutbound")}</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <DataTable
            columns={[
              { key: "sku", label: t("colSku") },
              { key: "name", label: t("colProduct") },
              {
                key: "oh",
                label: t("colOnHand"),
                className: "text-right tabular-nums",
              },
              {
                key: "min",
                label: t("colMin"),
                className: "text-right tabular-nums",
              },
              {
                key: "max",
                label: t("colMax"),
                className: "text-right tabular-nums",
              },
              { key: "abc", label: t("colAbc") },
            ]}
            rows={d.stock.map((s) => [
              s.sku,
              s.name,
              s.on_hand,
              s.min,
              s.max ?? "—",
              <AbcBadge key={s.sku} abc={s.abc} />,
            ])}
            emptyMessage={t("empty.products")}
          />
        </TabsContent>

        <TabsContent value="forecast" className="flex flex-col gap-2">
          {d.forecasts.length > 0 ? (
            <p className="text-muted-foreground text-sm">{t("forecastHint")}</p>
          ) : null}
          <DataTable
            columns={[
              { key: "sku", label: t("colSku") },
              { key: "name", label: t("colProduct") },
              ...(d.showWarehouseForecasts
                ? [{ key: "wh", label: t("colWarehouse") }]
                : []),
              {
                key: "d30",
                label: t("colDemand30"),
                className: "text-right tabular-nums",
              },
              {
                key: "d90",
                label: t("colDemand90"),
                className: "text-right tabular-nums",
              },
            ]}
            rows={d.forecasts.map((f) =>
              d.showWarehouseForecasts
                ? [f.sku, f.name, f.warehouse ?? "—", f.d30, f.d90]
                : [f.sku, f.name, f.d30, f.d90],
            )}
            emptyTitle={td("comingSoonTitle")}
            emptyMessage={`${td(deferredKey)} ${td("forecastHint")}`}
          />
        </TabsContent>

        <TabsContent value="inbound">
          <DataTable
            columns={[
              { key: "ref", label: t("colTransfer") },
              { key: "po", label: t("colPo") },
              { key: "p", label: t("colPartner") },
              { key: "eta", label: t("colEta") },
              { key: "st", label: t("colShipState") },
            ]}
            rows={d.inbound.map((r) => [
              r.ref,
              r.po,
              r.partner,
              r.eta,
              t(`inboundState.${r.state}`),
            ])}
            emptyMessage={t("empty.inbound")}
          />
        </TabsContent>

        <TabsContent value="outbound">
          <DataTable
            columns={[
              { key: "ref", label: t("colTransfer") },
              { key: "so", label: t("colSo") },
              { key: "p", label: t("colPartner") },
              { key: "sd", label: t("colShipDate") },
              { key: "st", label: t("colShipState") },
              { key: "note", label: t("colNote") },
            ]}
            rows={d.outbound.map((r) => [
              r.ref,
              r.so,
              r.partner,
              r.ship_date,
              t(`outboundState.${r.state}`),
              r.state === "delayed" ? (
                <ShipmentNoteDemo key={r.ref} refCode={r.ref} />
              ) : (
                "—"
              ),
            ])}
            emptyMessage={t("empty.outbound")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
