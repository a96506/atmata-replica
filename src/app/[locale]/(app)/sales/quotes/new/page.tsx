import { NewQuoteForm } from "./new-quote-form";
import { listCustomers, listProducts, listTaxCodes } from "@/lib/api/master";
import { PermissionGate } from "@/components/form/PermissionGate";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [customers, products, taxCodes] = await Promise.all([
    listCustomers(),
    listProducts(),
    listTaxCodes(),
  ]);

  return (
    <PermissionGate
      allow={["sales_rep", "admin"]}
      rationale="Creating quotes requires the `sales_rep` or `admin` role."
    >
      <NewQuoteForm
        locale={locale}
        customers={customers}
        products={products}
        taxCodes={taxCodes}
      />
    </PermissionGate>
  );
}
