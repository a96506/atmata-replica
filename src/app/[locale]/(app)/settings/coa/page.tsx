import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { ACCOUNTS } from "@/mocks/seed/gl";

const TYPE_ORDER: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  revenue: 4,
  expense: 5,
};

export default async function Page() {
  const rows = ACCOUNTS.slice().sort((a, b) => {
    const t = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (t !== 0) return t;
    return a.code.localeCompare(b.code);
  });
  return (
    <DocumentList
      title="Chart of accounts"
      subtitle="Account tree by class. Used by every posted document to write its journal entry."
    >
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
        ]}
        rows={rows.map((a) => [
          <span key="c" className="font-mono text-xs">{a.code}</span>,
          a.name,
          <span
            key="t"
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " +
              (a.type === "asset"
                ? "bg-emerald-100 text-emerald-900"
                : a.type === "liability"
                  ? "bg-red-100 text-red-800"
                  : a.type === "equity"
                    ? "bg-purple-100 text-purple-900"
                    : a.type === "revenue"
                      ? "bg-blue-100 text-blue-900"
                      : "bg-amber-100 text-amber-900")
            }
          >
            {a.type}
          </span>,
        ])}
      />
    </DocumentList>
  );
}
