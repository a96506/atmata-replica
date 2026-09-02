import "server-only";

import { getReadClient } from "@/lib/db/read";

/** Refresh derived metrics when the oldest row is older than this. */
const STALE_MS = 60 * 60 * 1000;

/** Per-company in-process throttle (survives until process restart). */
const lastRefreshAt = new Map<string, number>();
const refreshInFlight = new Map<string, Promise<void>>();
let refreshRpcsUnavailable = false;

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|relation/i.test(message);
}

function isMissingRpc(message: string): boolean {
  return /does not exist|schema cache|function/i.test(message);
}

async function getCompanyId(): Promise<string | null> {
  const client = await getReadClient();
  const { data, error } = await client.database.rpc("my_company_id");
  if (error || data == null || data === "") return null;
  return String(data);
}

type TimestampRow = { computed_at?: string; detected_at?: string };

/** Oldest age in ms across vendor_scores, inventory_forecasts, price_alerts. */
async function oldestMetricAgeMs(): Promise<number | null> {
  const client = await getReadClient();

  const [vendor, forecast, alerts] = await Promise.all([
    client.database
      .from("vendor_scores")
      .select("computed_at")
      .order("computed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client.database
      .from("inventory_forecasts")
      .select("computed_at")
      .order("computed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client.database
      .from("price_alerts")
      .select("detected_at")
      .order("detected_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const result of [vendor, forecast, alerts]) {
    if (result.error && isMissingRelation(String(result.error.message ?? ""))) {
      return null;
    }
  }

  const timestamps: number[] = [];
  const vendorRow = vendor.data as TimestampRow | null;
  const forecastRow = forecast.data as TimestampRow | null;
  const alertsRow = alerts.data as TimestampRow | null;

  if (vendorRow?.computed_at) {
    timestamps.push(new Date(vendorRow.computed_at).getTime());
  }
  if (forecastRow?.computed_at) {
    timestamps.push(new Date(forecastRow.computed_at).getTime());
  }
  if (alertsRow?.detected_at) {
    timestamps.push(new Date(alertsRow.detected_at).getTime());
  }

  if (timestamps.length === 0) return null;
  return Date.now() - Math.min(...timestamps);
}

async function metricsNeedRefresh(companyId: string): Promise<boolean> {
  const last = lastRefreshAt.get(companyId);
  if (last != null && Date.now() - last < STALE_MS) return false;

  const ageMs = await oldestMetricAgeMs();
  if (ageMs == null) return true;
  return ageMs > STALE_MS;
}

async function invokeRefreshRpcs(): Promise<void> {
  if (refreshRpcsUnavailable) return;

  const client = await getReadClient();
  const results = await Promise.all([
    client.database.rpc("refresh_vendor_scores", {}),
    client.database.rpc("refresh_price_alerts", { p_threshold_pct: 5 }),
    client.database.rpc("refresh_inventory_forecasts", {}),
  ]);

  for (const result of results) {
    if (!result.error) continue;
    const msg = String(result.error.message ?? "");
    if (isMissingRpc(msg)) {
      refreshRpcsUnavailable = true;
      return;
    }
    // Individual RPC failures (e.g. permission denied) are non-fatal.
  }
}

async function refreshForCompany(companyId: string): Promise<void> {
  if (refreshRpcsUnavailable) return;
  if (!(await metricsNeedRefresh(companyId))) return;

  await invokeRefreshRpcs();
  lastRefreshAt.set(companyId, Date.now());
}

/**
 * Recompute derived metrics (vendor scores, price alerts, inventory forecasts)
 * when the oldest derived row is more than one hour old. Safe to call on every
 * overview read — throttled in-process per company and deduped in-flight.
 */
export async function refreshMetricsIfStale(): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) return;

  const inflight = refreshInFlight.get(companyId);
  if (inflight) {
    await inflight;
    return;
  }

  const work = refreshForCompany(companyId).finally(() => {
    refreshInFlight.delete(companyId);
  });
  refreshInFlight.set(companyId, work);
  await work;
}
