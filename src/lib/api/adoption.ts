import type {
  AdoptionContext,
  AdoptionEdge,
  AdoptionParent,
  AdoptionTreeNode,
  DocType,
} from "@/types";
import { browserGet, browserRemove, browserSet } from "@/lib/browser-store";

/** Client-safe authenticated facade. Server Components use adoption.server.ts. */
export async function getAdoptableLines(
  parentType: DocType,
  parentId: string,
): Promise<AdoptionParent | null> {
  const params = new URLSearchParams({ parentType, parentId });
  const response = await fetch(`/api/adoption?${params}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Unable to read adoptable lines.");
  const body = (await response.json()) as { parent: AdoptionParent | null };
  return body.parent;
}

/** Tree reads are server-only; these declarations preserve the public contract. */
export async function getAncestry(
  _docType: DocType,
  _docId: string,
): Promise<AdoptionTreeNode | null> {
  throw new Error("getAncestry must be imported from adoption.server in Server Components.");
}

export async function getDescendants(
  _docType: DocType,
  _docId: string,
): Promise<AdoptionTreeNode | null> {
  throw new Error("getDescendants must be imported from adoption.server in Server Components.");
}

const ADOPTION_LOG_KEY = "atmata.adoption.log";

export async function recordAdoptions(edges: AdoptionEdge[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const prev: AdoptionEdge[] = JSON.parse(browserGet(ADOPTION_LOG_KEY) ?? "[]");
    browserSet(ADOPTION_LOG_KEY, JSON.stringify([...prev, ...edges]));
  } catch {
    // Local draft compatibility only; writes owns persistence.
  }
}

export function readAdoptionLog(): AdoptionEdge[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(browserGet(ADOPTION_LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function adoptionStorageKey(targetType: DocType): string {
  return `atmata.adopting.${targetType}`;
}

export function stashAdoptionContext(ctx: AdoptionContext): void {
  if (typeof window === "undefined") return;
  try {
    browserSet(adoptionStorageKey(ctx.targetType), JSON.stringify(ctx));
  } catch {
    // Ignore unavailable browser scratch.
  }
}

export function readAdoptionContext(targetType: DocType): AdoptionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = browserGet(adoptionStorageKey(targetType));
    return raw ? (JSON.parse(raw) as AdoptionContext) : null;
  } catch {
    return null;
  }
}

export function clearAdoptionContext(targetType: DocType): void {
  if (typeof window === "undefined") return;
  try {
    browserRemove(adoptionStorageKey(targetType));
  } catch {
    // Ignore unavailable browser scratch.
  }
}
