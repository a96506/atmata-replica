import { NewGrnForm } from "./new-grn-form";
import { getPurchaseOrder } from "@/lib/api/p2p";
import { listProducts, listSuppliers, listTaxCodes, listWarehouses } from "@/lib/api/master";
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
  const [products, taxCodes, warehouses, suppliers, po] = await Promise.all([
    listProducts(),
    listTaxCodes(),
    listWarehouses(),
    listSuppliers(),
    from ? getPurchaseOrder(from) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      operation="create_goods_receipt"
      rationale="Recording goods receipts requires a role permitted for create_goods_receipt (warehouse or admin)."
    >
      <NewGrnForm
        locale={locale}
        po={po}
        products={products}
        taxCodes={taxCodes}
        warehouses={warehouses}
        suppliers={suppliers}
      />
    </PermissionGate>
  );
}
