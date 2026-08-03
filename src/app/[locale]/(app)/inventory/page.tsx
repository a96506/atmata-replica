import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { DEMO_INVENTORY } from "@/lib/demo-data";
import { InventoryDemoToolbar, ShipmentNoteDemo } from "./inventory-demo-actions";

function AbcBadge({ abc }: { abc: "A" | "B" | "C" }) {
  const cls =
    abc === "A"
      ? "bg-primary/10 text-primary"
      : abc === "B"
        ? "bg-muted text-foreground"
        : "bg-muted text-foreground";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`} title={abc}>
      ABC · {abc}
    </span>
  );
}

function alertTone(s: string) {
  if (s === "critical") return "border-status-danger-border bg-status-danger-muted text-status-danger-foreground";
  return "border-status-pending-border bg-status-pending-muted text-status-pending-foreground";
}

export default async function InventoryPage() {
  const t = await getTranslations("inventory");
  const d = DEMO_INVENTORY;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-foreground">{t("subtitle")}</p>
        </div>
        <InventoryDemoToolbar />
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t("secReorder")}</h2>
        <div className="grid gap-2">
          {d.reorder_alerts.map((a) => (
            <div
              key={a.sku}
              className={`flex flex-col justify-between gap-2 rounded-xl border p-4 text-sm sm:flex-row sm:items-center ${alertTone(a.severity)}`}
              role="status"
            >
              <div>
                <p className="font-semibold">
                  {a.name}{" "}
                  <span className="font-mono text-xs opacity-80">({a.sku})</span>
                </p>
                <p className="mt-0.5">{t("reorderShort", { n: a.short_by })}</p>
              </div>
              <span className="rounded-full bg-card/80 px-3 py-1 text-xs font-medium uppercase">
                {t(`severity.${a.severity}`)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t("secStock")}</h2>
        <DataTable
          columns={[
            { key: "sku", label: t("colSku") },
            { key: "name", label: t("colProduct") },
            { key: "oh", label: t("colOnHand"), className: "text-right tabular-nums" },
            { key: "min", label: t("colMin"), className: "text-right tabular-nums" },
            { key: "max", label: t("colMax"), className: "text-right tabular-nums" },
            { key: "abc", label: t("colAbc") },
          ]}
          rows={d.stock.map((s) => [
            s.sku,
            s.name,
            s.on_hand,
            s.min,
            s.max,
            <AbcBadge key={s.sku} abc={s.abc} />,
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t("secForecast")}</h2>
        <p className="text-sm text-muted-foreground">{t("forecastHint")}</p>
        <DataTable
          columns={[
            { key: "sku", label: t("colSku") },
            { key: "name", label: t("colProduct") },
            { key: "d30", label: t("colDemand30"), className: "text-right tabular-nums" },
            { key: "d90", label: t("colDemand90"), className: "text-right tabular-nums" },
          ]}
          rows={d.forecasts.map((f) => [f.sku, f.name, f.d30, f.d90])}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{t("secInbound")}</h2>
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
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{t("secOutbound")}</h2>
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
              r.state === "delayed" ? <ShipmentNoteDemo key={r.ref} refCode={r.ref} /> : "—",
            ])}
          />
        </div>
      </section>
    </div>
  );
}
