/**
 * Pure-JS fuzzy matcher. No dependency.
 *
 * Score = (# chars matched in order / query length) − position-penalty.
 * Substring contiguous matches win over scattered. Case-insensitive.
 */

import type { SearchResult } from "@/types/search";

export type ScoredResult = SearchResult & { score: number };

function haystackOf(r: SearchResult): string {
  return [
    r.label,
    r.subtitle ?? "",
    r.kind,
    ...(r.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  // Direct substring → high score, bonus for early position.
  const direct = haystack.indexOf(n);
  if (direct >= 0) {
    return 100 - Math.min(50, direct);
  }
  // Sequential char match anywhere.
  let hi = 0;
  let matched = 0;
  let firstHit = -1;
  for (const ch of n) {
    const idx = haystack.indexOf(ch, hi);
    if (idx < 0) return 0;
    if (firstHit < 0) firstHit = idx;
    matched += 1;
    hi = idx + 1;
  }
  return Math.max(1, Math.floor((matched / n.length) * 30) - Math.min(10, firstHit));
}

export function fuzzy(
  index: SearchResult[],
  query: string,
  max = 12,
): ScoredResult[] {
  const q = query.trim();
  if (!q) return [];
  return index
    .map((r) => ({ ...r, score: score(haystackOf(r), q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
