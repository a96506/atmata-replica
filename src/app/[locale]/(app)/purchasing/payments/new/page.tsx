import { NewPaymentForm } from "./new-payment-form";
import { getVendorBill, listVendorBills } from "@/lib/api/p2p";
import { listBankAccounts, listSuppliers } from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await params;
  const { from } = await searchParams;
  const [bills, suppliers, banks, sourceBill] = await Promise.all([
    listVendorBills(),
    listSuppliers(),
    listBankAccounts(),
    from ? getVendorBill(from) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      operation="create_vendor_payment"
      rationale="Creating vendor payments requires a role permitted for create_vendor_payment (ap_clerk or admin)."
    >
      <NewPaymentForm
        locale={locale}
        bills={bills}
        suppliers={suppliers}
        banks={banks}
        sourceBill={sourceBill}
      />
    </PermissionGate>
  );
}
