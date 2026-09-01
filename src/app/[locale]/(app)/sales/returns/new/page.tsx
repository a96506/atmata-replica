import { AdoptionNewShell } from "@/components/doc/AdoptionNewShell";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <PermissionGate
      operation="create_customer_return"
      rationale="Creating customer returns requires a role permitted for create_customer_return (warehouse or admin)."
    >
      <AdoptionNewShell
        locale={locale}
        targetType="customer_return"
        title="New customer return"
        backHref={`/${locale}/sales/returns`}
        banner={
          <div className="rounded-md border border-status-pending-border bg-status-pending-muted px-3 py-2 text-xs text-status-pending-foreground">
            On post, this return will generate a Credit Note and reverse the related stock moves.
          </div>
        }
      />
    </PermissionGate>
  );
}
