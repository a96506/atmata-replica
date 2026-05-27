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
      allow={["warehouse", "admin"]}
      rationale="Creating internal transfers requires the `warehouse` or `admin` role."
    >
      <NewTransferForm
        locale={locale}
        products={products}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
