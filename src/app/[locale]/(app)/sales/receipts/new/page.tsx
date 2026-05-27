import { NewReceiptForm } from "./new-receipt-form";
import { getCustomerInvoice, listCustomerInvoices } from "@/lib/api/q2c";
import { listBankAccounts, listCustomers } from "@/lib/api/master";
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
  const [invs, customers, banks, sourceInv] = await Promise.all([
    listCustomerInvoices(),
    listCustomers(),
    listBankAccounts(),
    from ? getCustomerInvoice(from) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      allow={["ar_clerk", "accountant", "admin"]}
      rationale="Creating customer receipts requires the `ar_clerk`, `accountant`, or `admin` role."
    >
      <NewReceiptForm
        locale={locale}
        invoices={invs}
        customers={customers}
        banks={banks}
        sourceInv={sourceInv}
      />
    </PermissionGate>
  );
}
