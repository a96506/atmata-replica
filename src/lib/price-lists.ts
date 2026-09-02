export type PriceListRow = {
  id: string;
  name: string;
  currency: string;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
};

/**
 * Active price list for a currency (quote/SO resolve). Schema has no
 * customer→price_list FK; currency + active + date window is the link.
 */
export function pickActivePriceList(
  lists: readonly PriceListRow[],
  currency: string,
  onDate: string = new Date().toISOString().slice(0, 10),
): PriceListRow | null {
  return (
    lists.find(
      (pl) =>
        pl.active &&
        pl.currency === currency &&
        (pl.startsOn == null || pl.startsOn <= onDate) &&
        (pl.endsOn == null || pl.endsOn >= onDate),
    ) ?? null
  );
}
