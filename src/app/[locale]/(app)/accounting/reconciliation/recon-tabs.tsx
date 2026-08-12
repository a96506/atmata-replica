"use client";

import * as React from "react";
import { StatementImporter } from "@/components/recon/StatementImporter";
import { RuleBuilder } from "@/components/recon/RuleBuilder";

const TABS = [
  { id: "import", label: "Import statement" },
  { id: "rules", label: "Rules" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ReconTabs() {
  const [active, setActive] = React.useState<TabId>("import");
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2" role="tablist">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={
                "cursor-pointer px-3 py-2 text-sm whitespace-nowrap " +
                (isActive
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-4 md:p-6">
        {active === "import" ? <StatementImporter /> : <RuleBuilder />}
      </div>
    </div>
  );
}
