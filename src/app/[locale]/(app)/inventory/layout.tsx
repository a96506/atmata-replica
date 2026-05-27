import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/app/ModuleSubnav";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <ModuleSubnav
        items={[
          { href: "/inventory", label: "Overview" },
          { href: "/inventory/stock-moves", label: "Stock moves" },
          { href: "/inventory/transfers", label: "Transfers" },
          { href: "/inventory/adjustments", label: "Adjustments" },
        ]}
      />
      {children}
    </div>
  );
}
