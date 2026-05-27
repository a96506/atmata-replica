/**
 * Atmata — Global Search types.
 */

export type SearchKind = "doc" | "product" | "action" | "settings";

export type SearchResult = {
  id: string;
  kind: SearchKind;
  /** Primary line — the matchable text. */
  label: string;
  /** Secondary line shown beneath the label. */
  subtitle?: string;
  /** Where to navigate on select. Receives the resolved locale. */
  href: (locale: string) => string;
  /** Extra terms folded into the searchable text. */
  keywords?: string[];
};
