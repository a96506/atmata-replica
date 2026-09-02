import { redirect } from "next/navigation";

/** Purchasing alias for AP OCR — discoverability for ap_clerk. */
export default async function PurchasingScanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/accounting/invoices`);
}
