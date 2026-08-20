import { CompanyList } from "@/features/platform-admin/presentation/company-list";
import { listCompanies } from "@/features/platform-admin/application/queries";

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; offset?: string }>;
}) {
  const { q, status, offset } = await searchParams;
  const list = await listCompanies({
    search: q ?? "",
    status: status === "active" || status === "suspended" ? status : "",
    offset: Number(offset ?? 0) || 0,
    limit: 50,
  });
  return <CompanyList list={list} search={q ?? ""} status={status ?? ""} />;
}
