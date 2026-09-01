import { NewInvoiceForm } from "./new-invoice-form";
import { getDeliveryNote, getSalesOrder } from "@/lib/api/q2c";
import {
  listCompanies,
  listCustomers,
  listProducts,
  listTaxCodes,
} from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; fromDn?: string }>;
}) {
  const { locale } = await params;
  const { from, fromDn } = await searchParams;
  const [companies, customers, products, taxCodes, so, dn] = await Promise.all([
    listCompanies(),
    listCustomers(),
    listProducts(),
    listTaxCodes(),
    from ? getSalesOrder(from) : Promise.resolve(null),
    fromDn ? getDeliveryNote(fromDn) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      operation="create_customer_invoice"
      rationale="Creating customer invoices requires a role permitted for create_customer_invoice (ar_clerk or admin)."
    >
      <NewInvoiceForm
        locale={locale}
        companies={companies}
        customers={customers}
        products={products}
        taxCodes={taxCodes}
        so={so}
        dn={dn}
      />
    </PermissionGate>
  );
}
