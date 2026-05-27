import type { ReactNode } from "react";
import { ModuleSubnav } from "@/components/app/ModuleSubnav";

export default function AccountingLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <ModuleSubnav
        items={[
          { href: "/accounting", label: "Overview" },
          { href: "/accounting/invoices", label: "AP invoices (OCR)" },
          { href: "/accounting/journal-entries", label: "Journal entries" },
          { href: "/accounting/reconciliation", label: "Reconciliation" },
          { href: "/accounting/financials", label: "Financials" },
          { href: "/accounting/close", label: "Month-end close" },
        ]}
      />
      {children}
    </div>
  );
}
