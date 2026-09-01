import { NewSoForm } from "./new-so-form";
import { getQuote } from "@/lib/api/q2c";
import {
  listCustomers,
  listProducts,
  listTaxCodes,
  listWarehouses,
} from "@/lib/api/master";
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
  const [customers, products, taxCodes, warehouses, quote] = await Promise.all([
    listCustomers(),
    listProducts(),
    listTaxCodes(),
    listWarehouses(),
    from ? getQuote(from) : Promise.resolve(null),
  ]);

  return (
    <PermissionGate
      operation="create_sales_order"
      rationale="Creating sales orders requires a role permitted for create_sales_order (sales_rep, ar_clerk, or admin)."
    >
      <NewSoForm
        locale={locale}
        customers={customers}
        products={products}
        taxCodes={taxCodes}
        warehouses={warehouses}
        quote={quote}
      />
    </PermissionGate>
  );
}
