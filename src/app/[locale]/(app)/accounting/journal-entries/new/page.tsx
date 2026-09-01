import { NewJeForm } from "./new-je-form";
import { listAccounts } from "@/lib/api/gl";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const accounts = await listAccounts();
  return (
    <PermissionGate
      operation="create_journal_entry"
      rationale="Creating journal entries requires a role permitted for create_journal_entry (accountant or admin)."
    >
      <NewJeForm locale={locale} accounts={accounts} />
    </PermissionGate>
  );
}
