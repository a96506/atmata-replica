import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/app/ModuleSubnav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <ModuleSubnav
        items={[
          { href: "/settings", label: "Overview" },
          { href: "/settings/company", label: "Company" },
          { href: "/settings/branches", label: "Branches" },
          { href: "/settings/fiscal-calendar", label: "Fiscal calendar" },
          { href: "/settings/coa", label: "Chart of accounts" },
          { href: "/settings/tax-codes", label: "Tax codes" },
          { href: "/settings/currencies", label: "Currencies" },
          { href: "/settings/fx-rates", label: "FX rates" },
          { href: "/settings/payment-terms", label: "Payment terms" },
          { href: "/settings/sequences", label: "Sequences" },
          { href: "/settings/customers", label: "Customers" },
          { href: "/settings/suppliers", label: "Suppliers" },
          { href: "/settings/products", label: "Products" },
          { href: "/settings/price-lists", label: "Price lists" },
          { href: "/settings/warehouses", label: "Warehouses" },
          { href: "/settings/bank-accounts", label: "Bank accounts" },
          { href: "/settings/approval-rules", label: "Approval rules" },
          { href: "/settings/users", label: "Users" },
        ]}
      />
      {children}
    </div>
  );
}
