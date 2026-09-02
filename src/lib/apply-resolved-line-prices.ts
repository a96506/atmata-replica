"use client";

import type { LineDraft } from "@/components/form/ProductLinesEditor";
import { resolvePriceListItemAction } from "@/lib/actions/master";
import {
  pickActivePriceList,
  type PriceListRow,
} from "@/lib/price-lists";

/**
 * After ProductLinesEditor patches a line (product/qty), resolve unit price
 * from the active currency price list when a customer is selected.
 * Soft-fails to the editor's product default when RPC finds no match.
 */
export async function applyResolvedLinePrices(args: {
  lines: LineDraft[];
  customerId: string;
  currency: string;
  onDate: string;
  priceLists: readonly PriceListRow[];
}): Promise<LineDraft[]> {
  const { lines, customerId, currency, onDate, priceLists } = args;
  if (!customerId) return lines;
  const list = pickActivePriceList(priceLists, currency, onDate);
  if (!list) return lines;

  let changed = false;
  const next = await Promise.all(
    lines.map(async (line) => {
      if (!line.productId || line.qty <= 0) return line;
      const result = await resolvePriceListItemAction({
        priceListId: list.id,
        productId: line.productId,
        qty: line.qty,
        onDate,
      });
      if (
        result.ok &&
        result.data &&
        result.data.unitPrice !== line.unitPrice
      ) {
        changed = true;
        return { ...line, unitPrice: result.data.unitPrice };
      }
      return line;
    }),
  );
  return changed ? next : lines;
}
