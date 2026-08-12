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
      allow={["sales_rep", "admin"]}
      rationale="Creating sales orders requires the `sales_rep` or `admin` role."
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
