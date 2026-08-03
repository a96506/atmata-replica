import { AdoptionNewShell } from "@/components/doc/AdoptionNewShell";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
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
  );
}
