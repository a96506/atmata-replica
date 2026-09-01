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
      operation="create_rfq"
      rationale="Creating RFQs requires a role permitted for create_rfq (buyer or admin)."
    >
      <AdoptionNewShell
        locale={locale}
        targetType="rfq"
        title="New RFQ"
        backHref={`/${locale}/purchasing/rfqs`}
        banner={
          <div className="rounded-md border border-status-pending-border bg-status-pending-muted px-3 py-2 text-xs text-status-pending-foreground">
            After save, invite vendors and record their quotes on the RFQ detail page.
          </div>
        }
      />
    </PermissionGate>
  );
}
