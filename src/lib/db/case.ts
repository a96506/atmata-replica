/**
 * Generic snake_case ↔ camelCase mapper for InsForge DB rows.
 *
 * PostgREST returns columns by their DB name (snake_case). UI entity types
 * in `src/types/entities` are camelCase. This single recursive mapper is the
 * only conversion layer — avoids ~35 hand-written per-entity mappers.
 *
 * Use on every `.select()` / `.single()` / `.rpc()` result before returning
 * to the UI. Arrays, objects, null, and primitives pass through untouched.
 */

export function camelize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as T;
  if (value === null || typeof value !== "object") return value as T;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, ch: string) =>
      ch.toUpperCase(),
    );
    out[camel] = camelize(val);
  }
  return out as T;
}

export function snakelize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => snakelize(v)) as T;
  if (value === null || typeof value !== "object") return value as T;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    out[snake] = snakelize(val);
  }
  return out as T;
}
