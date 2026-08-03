"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AdoptionPicker } from "./AdoptionPicker";
import { getAdoptableLines } from "@/lib/api/adoption";
import { legalAdoptions } from "@/lib/state-machines";
import { useSession } from "@/lib/session";
import { toast } from "@/components/toast";
import type {
  AdoptionParent,
  Currency,
  DocState,
  DocType,
} from "@/types";

/**
 * BulkAdoptButton — used in list-page bulk-action toolbars.
 *
 * Given a parent doc-type, a parent state (assumed the same for all selected
 * rows), and a list of selected ids, loads adoptable lines for each, then
 * opens the AdoptionPicker in multi-parent merge mode.
 */
export function BulkAdoptButton({
  parentType,
  parentState,
  selectedIds,
  currency,
  locale,
  onAfter,
}: {
  parentType: DocType;
  parentState: DocState;
  selectedIds: string[];
  currency: Currency;
  locale: string;
  onAfter?: () => void;
}) {
  const { role } = useSession();
  const t = useTranslations("adoption");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [targetType, setTargetType] = React.useState<DocType | null>(null);
  const [parents, setParents] = React.useState<AdoptionParent[]>([]);
  const [open, setOpen] = React.useState(false);
  const [hops, setHops] = React.useState(0);

  const targets = legalAdoptions(parentType, parentState, role);
  if (targets.length === 0) return null;
  if (selectedIds.length === 0) return null;

  const choose = async (chosen: DocType, hopsCount: number) => {
    setMenuOpen(false);
    const loaded = await Promise.all(selectedIds.map((id) => getAdoptableLines(parentType, id)));
    const usable = loaded.filter((p): p is AdoptionParent => p !== null);
    if (usable.length === 0) {
      toast.error("No adoptable lines on the selected docs.");
      return;
    }
    setTargetType(chosen);
    setParents(usable);
    setHops(hopsCount);
    setOpen(true);
    if (hopsCount > 0) {
      // eslint-disable-next-line no-console
      console.info("atmata:event", "adoption.multiHop", {
        from: `bulk:${parentType}`,
        to: chosen,
        hops: hopsCount,
        count: selectedIds.length,
      });
    }
  };

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary"
        >
          {t("bulkTitle")} ▾
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 min-w-[260px] rounded-md border border-border bg-card py-1 shadow-md"
          >
            <div className="border-b border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Direct
            </div>
            {targets
              .filter((tg) => (tg.hops ?? 0) === 0)
              .map((tg) => (
                <button
                  key={tg.targetType}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(tg.targetType, 0)}
                  className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm text-foreground hover:bg-primary/10"
                >
                  {tryT(t, `target.${tg.targetType}`, tg.targetType)}
                </button>
              ))}
            {targets.some((tg) => (tg.hops ?? 0) > 0) ? (
              <>
                <div className="border-b border-t border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Multi-hop
                </div>
                {targets
                  .filter((tg) => (tg.hops ?? 0) > 0)
                  .sort((a, b) => (a.hops ?? 0) - (b.hops ?? 0))
                  .map((tg) => (
                    <button
                      key={tg.targetType}
                      type="button"
                      role="menuitem"
                      onClick={() => choose(tg.targetType, tg.hops ?? 0)}
                      className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm text-foreground hover:bg-primary/10"
                    >
                      <div>{tryT(t, `target.${tg.targetType}`, tg.targetType)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        skips {tg.hops} hop{tg.hops === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {targetType ? (
        <AdoptionPicker
          locale={locale}
          targetType={targetType}
          parents={parents}
          currency={currency}
          open={open}
          onClose={() => {
            setOpen(false);
            onAfter?.();
          }}
          hops={hops}
        />
      ) : null}
    </>
  );
}

function tryT(
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  key: string,
  fallback: string,
): string {
  try {
    return t(key);
  } catch {
    return fallback;
  }
}
