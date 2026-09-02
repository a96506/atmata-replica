"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { awardRfqAction } from "@/lib/actions/documents";
import { canAnyOperation } from "@/lib/roles/capabilities";
import { useSession } from "@/lib/session";

type QuoteCol = {
  id: string;
  vendorLabel: string;
};

/**
 * Per-vendor Award controls for the RFQ Compare tab.
 * Only active when state is quotes_received and the user can award_rfq.
 */
export function RfqAwardButtons({
  locale,
  rfqId,
  expectedRowVersion,
  rfqState,
  awardedQuoteId,
  quotes,
}: {
  locale: "en" | "ar";
  rfqId: string;
  expectedRowVersion: number;
  rfqState: string;
  awardedQuoteId?: string;
  quotes: QuoteCol[];
}) {
  const router = useRouter();
  const { roles } = useSession();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const [pending, setPending] = React.useState(false);
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());

  const canAward =
    rfqState === "quotes_received" && canAnyOperation(roles, "award_rfq");

  if (!canAward && !awardedQuoteId) return null;

  const award = async (quoteId: string, vendorLabel: string) => {
    if (pending || !canAward) return;
    const ok = await confirm({
      title: `Award ${vendorLabel}?`,
      description:
        "Creates a purchase order from this vendor quote and marks the RFQ awarded.",
      confirmLabel: "Award",
      cancelLabel: "Keep comparing",
      tone: "default",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await awardRfqAction({
        locale,
        rfqId,
        quoteId,
        expectedRowVersion,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      toast.success(`Awarded · ${vendorLabel}`);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  return (
    <tr className="border-t border-border bg-muted/30">
      <td className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
        Award
      </td>
      {quotes.map((q) => (
        <td key={q.id} className="px-4 py-3 text-center">
          {awardedQuoteId === q.id ? (
            <span className="text-xs font-medium text-status-success-foreground">
              Winner
            </span>
          ) : canAward ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => award(q.id, q.vendorLabel)}
            >
              Award
            </Button>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}
