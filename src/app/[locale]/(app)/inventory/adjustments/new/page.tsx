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
      allow={["warehouse", "accountant", "admin"]}
      rationale="Creating stock adjustments requires the `warehouse`, `accountant`, or `admin` role."
    >
      <NewAdjustmentForm
        locale={locale}
        products={products}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
