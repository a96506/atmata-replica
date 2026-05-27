import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/app/ModuleSubnav";

export default function PurchasingLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <ModuleSubnav
        items={[
          { href: "/purchasing", label: "Overview" },
          { href: "/purchasing/purchase-requisitions", label: "Purchase requisitions" },
          { href: "/purchasing/rfqs", label: "RFQs" },
          { href: "/purchasing/purchase-orders", label: "Purchase orders" },
          { href: "/purchasing/goods-receipts", label: "Goods receipts" },
          { href: "/purchasing/bills", label: "Vendor bills" },
          { href: "/purchasing/payments", label: "Vendor payments" },
          { href: "/purchasing/vendor-returns", label: "Vendor returns" },
          { href: "/purchasing/debit-notes", label: "Debit notes" },
        ]}
      />
      {children}
    </div>
  );
}
