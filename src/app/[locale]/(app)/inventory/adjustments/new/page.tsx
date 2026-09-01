import { NewAdjustmentForm } from "./new-adjustment-form";
import { listProducts, listWarehouses } from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [products, warehouses] = await Promise.all([listProducts(), listWarehouses()]);
  return (
    <PermissionGate
      operation="create_stock_adjustment"
      rationale="Creating stock adjustments requires a role permitted for create_stock_adjustment (warehouse or admin)."
    >
      <NewAdjustmentForm
        locale={locale}
        products={products}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
