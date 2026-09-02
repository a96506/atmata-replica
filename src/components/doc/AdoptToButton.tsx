"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AdoptionPicker } from "./AdoptionPicker";
import { getAdoptableLines, getAdoptionMetrics } from "@/lib/api/adoption";
import type { AdoptionMetricsStub } from "@/app/api/adoption/route";
import { legalAdoptions } from "@/lib/state-machines";
import { useSession } from "@/lib/session";
import { toast } from "@/components/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { showsDeferredRoadmap } from "@/lib/deferred-empty";
import type {
  AdoptionParent,
  Currency,
  DocState,
  DocType,
} from "@/types";

/**
 * AdoptToButton — primary trigger for the AdoptionPicker.
 *
 * Used in two shapes:
 *   1. Detail page quick-action: pass `parentType` + `parentId`. The button
 *      renders a "Adopt to →" dropdown listing legal child types via
 *      `legalAdoptions`. Picking one loads the parent lines and opens the
 *      AdoptionPicker.
 *   2. List page bulk action: pass `parents` directly (already-loaded
 *      AdoptionParent[]). Used by DocumentList row-selection.
 *
 * In both cases, the picker handles the rest (qty overrides, target /new
 * navigation).
 */

type SinglyMode = {
  mode: "single";
  parentType: DocType;
  parentState: DocState;
  parentId: string;
  currency: Currency;
  locale: string;
};

type BulkMode = {
  mode: "bulk";
  parents: AdoptionParent[];
  /** Pre-resolved legal targets (caller computed from selected rows). */
  targets: { targetType: DocType; label: string; hops?: number }[];
  currency: Currency;
  locale: string;
};

export type AdoptToButtonProps = SinglyMode | BulkMode;

export function AdoptToButton(props: AdoptToButtonProps) {
  const { role, roles } = useSession();
  const t = useTranslations("adoption");
  const td = useTranslations("deferred");
  const showMetricsNote = showsDeferredRoadmap(role, roles);
  const [open, setOpen] = React.useState(false);
  const [targetType, setTargetType] = React.useState<DocType | null>(null);
  const [parents, setParents] = React.useState<AdoptionParent[]>([]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeHops, setActiveHops] = React.useState(0);
  const [metrics, setMetrics] = React.useState<AdoptionMetricsStub | null>(null);

  React.useEffect(() => {
    if (!showMetricsNote) return;
    void getAdoptionMetrics().then(setMetrics);
  }, [showMetricsNote]);

  const targets =
    props.mode === "single"
      ? legalAdoptions(props.parentType, props.parentState, role)
      : props.targets;

  if (!targets.length) return null;

  const choose = async (chosen: DocType, hops: number) => {
    setMenuOpen(false);
    setActiveHops(hops);
    if (hops > 0) {
      // eslint-disable-next-line no-console
      console.info("atmata:event", "adoption.multiHop", {
        from: props.mode === "single" ? props.parentType : "bulk",
        to: chosen,
        hops,
      });
    }
    if (props.mode === "bulk") {
      setTargetType(chosen);
      setParents(props.parents);
      setOpen(true);
      return;
    }
    const parent = await getAdoptableLines(props.parentType, props.parentId);
    if (!parent) {
      toast.error("Parent document not found.");
      return;
    }
    if (parent.lines.every((l) => l.maxQty === 0)) {
      toast.error(t("fullyConsumed"));
      return;
    }
    setTargetType(chosen);
    setParents([parent]);
    setOpen(true);
  };

  return (
    <>
      <div className="relative inline-block">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="cursor-pointer rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-describedby={showMetricsNote ? "adopt-metrics-deferred" : undefined}
              >
                {props.mode === "bulk" ? t("bulkTitle") : t("title")} ▾
              </button>
            </TooltipTrigger>
            {showMetricsNote ? (
              <TooltipContent id="adopt-metrics-deferred" className="max-w-xs">
                {metrics && metrics.totalEdges > 0 ? (
                  <p>{formatAdoptionMetrics(metrics, t)}</p>
                ) : (
                  <p>{td("adoptionMetricsTooltip")}</p>
                )}
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 min-w-[260px] rounded-md border border-border bg-card py-1 shadow-md"
          >
            <Group title="Direct">
              {targets
                .filter((tg) => (tg.hops ?? 0) === 0)
                .map((target) => (
                  <MenuItem
                    key={target.targetType}
                    label={translateTarget(t, target.targetType)}
                    onClick={() => choose(target.targetType, 0)}
                  />
                ))}
            </Group>
            {targets.some((tg) => (tg.hops ?? 0) > 0) ? (
              <Group title="Multi-hop">
                {targets
                  .filter((tg) => (tg.hops ?? 0) > 0)
                  .sort((a, b) => (a.hops ?? 0) - (b.hops ?? 0))
                  .map((target) => (
                    <MenuItem
                      key={target.targetType}
                      label={translateTarget(t, target.targetType)}
                      subtitle={`skips ${target.hops} hop${target.hops === 1 ? "" : "s"}`}
                      onClick={() => choose(target.targetType, target.hops ?? 0)}
                    />
                  ))}
              </Group>
            ) : null}
          </div>
        ) : null}
      </div>

      {targetType ? (
        <AdoptionPicker
          locale={props.locale}
          targetType={targetType}
          parents={parents}
          currency={props.currency}
          open={open}
          onClose={() => setOpen(false)}
          hops={activeHops}
        />
      ) : null}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function MenuItem({
  label,
  subtitle,
  onClick,
}: {
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm text-foreground hover:bg-primary/10"
    >
      <div>{label}</div>
      {subtitle ? <div className="text-[11px] text-muted-foreground">{subtitle}</div> : null}
    </button>
  );
}

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

function translateTarget(t: Translator, type: DocType): string {
  try {
    return t(`target.${type}`);
  } catch {
    return humanTarget(type);
  }
}


function formatAdoptionMetrics(
  metrics: AdoptionMetricsStub,
  t: Translator,
): string {
  const parts = Object.entries(metrics.byTargetType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${translateTarget(t, type as DocType)} (${count})`);
  return `Last 30 days: ${parts.join(", ")}`;
}

function humanTarget(t: DocType): string {
  switch (t) {
    case "rfq": return "RFQ";
    case "po": return "Purchase Order";
    case "grn": return "Goods Receipt";
    case "vendor_bill": return "Vendor Bill";
    case "vendor_payment": return "Vendor Payment";
    case "vendor_return": return "Vendor Return";
    case "debit_note": return "Debit Note";
    case "so": return "Sales Order";
    case "dn": return "Delivery Note";
    case "customer_invoice": return "Customer Invoice";
    case "customer_receipt": return "Customer Receipt";
    case "customer_return": return "Customer Return";
    case "credit_note": return "Credit Note";
    default: return t;
  }
}
