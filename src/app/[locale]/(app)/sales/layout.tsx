import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/app/ModuleSubnav";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <ModuleSubnav
        items={[
          { href: "/sales", label: "Overview" },
          { href: "/sales/quotes", label: "Quotes" },
          { href: "/sales/orders", label: "Sales orders" },
          { href: "/sales/deliveries", label: "Deliveries" },
          { href: "/sales/invoices", label: "Customer invoices" },
          { href: "/sales/receipts", label: "Customer receipts" },
          { href: "/sales/returns", label: "Customer returns" },
          { href: "/sales/credit-notes", label: "Credit notes" },
        ]}
      />
      {children}
    </div>
  );
}
