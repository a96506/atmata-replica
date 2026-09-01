import { NewTransferForm } from "./new-transfer-form";
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
      operation="create_internal_transfer"
      rationale="Creating internal transfers requires a role permitted for create_internal_transfer (warehouse or admin)."
    >
      <NewTransferForm
        locale={locale}
        products={products}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
