import { NewPoForm } from "./new-po-form";
import {
  listPaymentTerms,
  listProducts,
  listSuppliers,
  listTaxCodes,
  listWarehouses,
} from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [suppliers, products, taxCodes, paymentTerms, warehouses] = await Promise.all([
    listSuppliers(),
    listProducts(),
    listTaxCodes(),
    listPaymentTerms(),
    listWarehouses(),
  ]);

  return (
    <PermissionGate
      allow={["buyer", "admin"]}
      rationale="Creating Purchase Orders requires the `buyer` or `admin` role."
    >
      <NewPoForm
        locale={locale}
        suppliers={suppliers}
        products={products}
        taxCodes={taxCodes}
        paymentTerms={paymentTerms}
        warehouses={warehouses}
      />
    </PermissionGate>
  );
}
