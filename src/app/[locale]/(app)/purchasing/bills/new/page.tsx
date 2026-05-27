import { NewBillForm } from "./new-bill-form";
import {
  getGoodsReceipt,
  getPurchaseOrder,
  listVendorBills,
} from "@/lib/api/p2p";
import {
  listPaymentTerms,
  listProducts,
  listSuppliers,
  listTaxCodes,
} from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; fromGrn?: string }>;
}) {
  const { locale } = await params;
  const { from, fromGrn } = await searchParams;
  const [products, taxCodes, suppliers, paymentTerms, po, grn, existingBills] =
    await Promise.all([
      listProducts(),
      listTaxCodes(),
      listSuppliers(),
      listPaymentTerms(),
      from ? getPurchaseOrder(from) : Promise.resolve(null),
      fromGrn ? getGoodsReceipt(fromGrn) : Promise.resolve(null),
      listVendorBills(),
    ]);

  return (
    <PermissionGate
      allow={["ap_clerk", "admin"]}
      rationale="Creating vendor bills requires the `ap_clerk` or `admin` role."
    >
      <NewBillForm
        locale={locale}
        po={po}
        grn={grn}
        existingBills={existingBills}
        products={products}
        taxCodes={taxCodes}
        suppliers={suppliers}
        paymentTerms={paymentTerms}
      />
    </PermissionGate>
  );
}
