/**
 * Atmata frontend — fake-service base.
 *
 * Today: in-memory map + sessionStorage hydration on the client. Returns
 * Promises with a small artificial latency so calling code looks like real
 * fetch.
 *
 * Tomorrow (backend team): flip `USE_FAKE_SERVICE` to `false` and replace
 * `fakeService.*` internals with `fetch` against the real API. The function
 * signatures consumed by the UI MUST NOT change.
 */

const LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

const isBrowser = typeof window !== "undefined";
const memory = new Map<string, unknown>();

function readStore<T>(key: string, fallback: T): T {
  if (!isBrowser) return (memory.get(key) as T) ?? fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return (memory.get(key) as T) ?? fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStore<T>(key: string, value: T): T {
  memory.set(key, value);
  if (isBrowser) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota or disabled storage — fall back to memory only
    }
  }
  return value;
}

export const fakeService = {
  async list<T>(resource: string, seed: T[] = []): Promise<T[]> {
    return delay(readStore<T[]>(resource, seed));
  },

  async get<T extends { id: string }>(
    resource: string,
    id: string,
    seed: T[] = [],
  ): Promise<T | null> {
    const all = readStore<T[]>(resource, seed);
    return delay(all.find((x) => x.id === id) ?? null);
  },

  async create<T extends { id?: string }>(
    resource: string,
    payload: Omit<T, "id"> & Partial<{ id: string }>,
    seed: T[] = [],
  ): Promise<T> {
    const all = readStore<T[]>(resource, seed);
    const id =
      payload.id ?? `${resource}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const item = { ...payload, id } as T;
    writeStore(resource, [item, ...all]);
    return delay(item);
  },

  async update<T extends { id: string }>(
    resource: string,
    id: string,
    patch: Partial<T>,
    seed: T[] = [],
  ): Promise<T | null> {
    const all = readStore<T[]>(resource, seed);
    const idx = all.findIndex((x) => x.id === id);
    if (idx === -1) return delay(null);
    const updated = { ...all[idx], ...patch } as T;
    const next = [...all];
    next[idx] = updated;
    writeStore(resource, next);
    return delay(updated);
  },

  async remove<T extends { id: string }>(
    resource: string,
    id: string,
    seed: T[] = [],
  ): Promise<boolean> {
    const all = readStore<T[]>(resource, seed);
    const next = all.filter((x) => x.id !== id);
    writeStore(resource, next);
    return delay(true);
  },

  reset(resource: string): void {
    memory.delete(resource);
    if (isBrowser) {
      try {
        window.sessionStorage.removeItem(resource);
      } catch {
        // ignore
      }
    }
  },
};

/** Backend team flips this to `false` when wiring real endpoints. */
export const USE_FAKE_SERVICE = true;
