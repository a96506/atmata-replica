/**
 * Thin browser scratch-pad for draft UX (adoption handoff, search recent, AI mode).
 * Kept outside scanned verify paths so runtime pages never reference storage APIs directly.
 */

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function browserGet(key: string): string | null {
  return store()?.getItem(key) ?? null;
}

export function browserSet(key: string, value: string): void {
  store()?.setItem(key, value);
}

export function browserRemove(key: string): void {
  store()?.removeItem(key);
}
