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
      allow={["accountant", "admin"]}
      rationale="Creating manual journal entries requires the `accountant` or `admin` role."
    >
      <NewJeForm locale={locale} accounts={accounts} />
    </PermissionGate>
  );
}
