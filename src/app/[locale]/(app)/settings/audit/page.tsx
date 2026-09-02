import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable, type Column } from "@/components/data-table";
import { listCompanyAuditEventsPage } from "@/lib/api/audit";
import { docPath } from "@/lib/api/doc-paths";
import { parseListPage } from "@/lib/db/read";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "audit_log");

const COLUMNS: Column[] = [
  { key: "at", label: "When" },
  { key: "doc", label: "Document" },
  { key: "transition", label: "Change" },
  { key: "by", label: "By" },
  { key: "reason", label: "Reason" },
];

function actorLabel(fullName: string | null | undefined, email: string | null | undefined, by: string | null) {
  if (fullName?.trim()) return fullName.trim();
  if (email?.trim()) return email.trim();
  return by ? "—" : "—";
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; limit?: string | string[] }>;
}) {
  const { locale } = await params;
  const { page, limit, offset } = parseListPage(await searchParams);
  const { items, total } = await listCompanyAuditEventsPage({ limit, offset }).catch(
    () => ({ items: [], total: 0 }),
  );

  const tableRows = items.map((e) => {
    const href = docPath(e.docType, e.docId);
    const transition =
      e.fromState || e.toState
        ? `${e.fromState ?? "—"} → ${e.toState ?? "—"}`
        : (e.eventType ?? "—");
    return [
      new Date(e.at).toLocaleString(),
      href ? (
        <Link
          key="doc"
          href={`/${locale}${href}`}
          className="font-medium text-primary hover:underline"
        >
          {e.docType} · {e.docId.slice(0, 8)}
        </Link>
      ) : (
        `${e.docType} · ${e.docId.slice(0, 8)}`
      ),
      transition,
      actorLabel(e.actor?.fullName, e.actor?.email, e.by),
      e.reason ?? "—",
    ];
  });

  return (
    <DocumentList
      title="Audit log"
      subtitle="Company-wide document state changes from audit_events."
    >
      <DataTable
        columns={COLUMNS}
        rows={tableRows}
        emptyMessage="No audit events yet."
        sortable={false}
        serverPagination={{ page, pageSize: limit, total }}
      />
    </DocumentList>
  );
}
