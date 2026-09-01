import { NewDnForm } from "./new-dn-form";
import { getSalesOrder } from "@/lib/api/q2c";
import { listCustomers, listProducts, listTaxCodes, listWarehouses } from "@/lib/api/master";
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
  const [customers, products, taxCodes, warehouses, so] = await Promise.all([
    listCustomers(),
    listProducts(),
    listTaxCodes(),
    listWarehouses(),
    from ? getSalesOrder(from) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      operation="create_delivery_note"
      rationale="Creating delivery notes requires a role permitted for create_delivery_note (warehouse or admin)."
    >
      <NewDnForm
        locale={locale}
        so={so}
        customers={customers}
        products={products}
        taxCodes={taxCodes}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
