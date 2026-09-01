import { NewPrForm } from "./new-pr-form";
import { listProducts, listTaxCodes, listWarehouses } from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [products, taxCodes, warehouses] = await Promise.all([
    listProducts(),
    listTaxCodes(),
    listWarehouses(),
  ]);

  return (
    <PermissionGate
      operation="create_purchase_requisition"
      rationale="Creating purchase requisitions requires a role permitted for create_purchase_requisition (buyer or admin)."
    >
      <NewPrForm
        locale={locale}
        products={products}
        taxCodes={taxCodes}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
