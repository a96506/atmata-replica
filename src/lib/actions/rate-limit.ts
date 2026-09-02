import "server-only";

import { headers } from "next/headers";

/**
 * Best-effort, in-memory, IP-scoped sliding-window throttle.
 *
 * Day-one: an in-memory `Map` is OK on Railway with one replica (shared heap
 * for that process). When a second replica is added, move to a durable store
 * (DB or Redis); until then counters are not shared across instances.
 * See https://securestartkit.com/blog/how-to-rate-limit-nextjs-server-actions-before-they-get-abused
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Drop expired entries occasionally so the map can't grow unbounded.
const GC_INTERVAL_MS = 60_000;
let lastGc = Date.now();

function gc(now: number) {
  if (now - lastGc < GC_INTERVAL_MS) return;
  lastGc = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  // Reverse proxies (including Railway) set x-forwarded-for; fall back to a
  // sentinel so we still throttle when no proxy header is present (e.g. local).
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Returns `true` when the request is allowed, `false` when the bucket is over
 * `limit` within the rolling `windowMs`. Mirrors the IP-scoped throttle the
 * InsForge password-reset endpoint applies server-side.
 */
export async function checkRateLimit(
  scope: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const ip = await getClientIp();
  const key = `${scope}:${ip}`;
  const now = Date.now();
  gc(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true };
}
