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
      targetType="vendor_return"
      title="New vendor return"
      backHref={`/${locale}/purchasing/vendor-returns`}
      banner={
        <div className="rounded-md border border-status-pending-border bg-status-pending-muted px-3 py-2 text-xs text-status-pending-foreground">
          On post, this return will generate a Debit Note and reverse the related stock moves.
        </div>
      }
    />
  );
}
