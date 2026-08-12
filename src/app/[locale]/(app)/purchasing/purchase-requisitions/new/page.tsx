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
      allow={["warehouse", "buyer", "admin"]}
      rationale="Creating purchase requisitions requires the `warehouse`, `buyer`, or `admin` role."
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
