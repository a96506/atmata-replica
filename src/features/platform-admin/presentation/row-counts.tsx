import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import type { PlatformRowCounts } from "../domain/company";

export async function RowCounts({ counts }: { counts: PlatformRowCounts }) {
  const t = await getTranslations("platformAdmin");
  const rows = Object.entries(counts.counts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("counts.title")} · {t("counts.total", { count: counts.totalRows })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          pageSize={20}
          columns={[
            { key: "table", label: t("counts.table") },
            { key: "rows", label: t("counts.rows"), className: "text-end tabular-nums" },
          ]}
          rows={rows.map(([table, count]) => [table, String(count)])}
        />
        <p className="text-muted-foreground mt-3 text-xs">
          {t("counts.generatedAt", { at: counts.generatedAt })}
        </p>
      </CardContent>
    </Card>
  );
}
