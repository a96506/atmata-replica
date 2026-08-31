import { createInsForgeAdminClient } from "@/lib/insforge/server";
import {
  isSchedulerJob,
  kuwaitBusinessDate,
  type SchedulerJob,
} from "@/lib/schedules/manifest";
import {
  PLATFORM_JOBS_COMPANY_ID,
  type JobRow,
} from "@/lib/jobs/types";

export type ErpJobPayload = {
  job: SchedulerJob;
  runKey?: string;
  scheduleName?: string;
};

export type ErpCompanyResult = {
  companyId: string;
  status: string;
  runId?: string;
  error?: string;
};

export type ErpRunResult = {
  job: SchedulerJob;
  runKey: string;
  succeeded: number;
  failed: number;
  skipped: number;
  companies: ErpCompanyResult[];
};

type FxTable = {
  publicationDate: string;
  kwdPer: Record<string, number>;
  stale: boolean;
};

type AdminClient = ReturnType<typeof createInsForgeAdminClient>;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/** Parse AllRatesToday CBK latest payload into KWD-per-unit rates. */
export function parseCbkLatest(body: unknown, today: string): FxTable {
  const row = (body ?? {}) as Record<string, unknown>;
  const publicationDate = String(
    row.rate_date ?? row.date ?? row.publicationDate ?? "",
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) {
    throw new Error("invalid publication date");
  }
  const rates = Array.isArray(row.rates)
    ? row.rates
    : Array.isArray(row.data)
      ? row.data
      : [];
  const kwdPer: Record<string, number> = { KWD: 1 };
  for (const item of rates) {
    const entry = (item ?? {}) as Record<string, unknown>;
    // AllRatesToday CBK table: { base, quote, type, value } (KWD per 1 base).
    const source = String(entry.base ?? entry.source ?? "").toUpperCase();
    const target = String(entry.quote ?? entry.target ?? "").toUpperCase();
    const rate = Number(entry.value ?? entry.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    if (target === "KWD" && source) kwdPer[source] = rate;
    else if (source === "KWD" && target) kwdPer[target] = 1 / rate;
  }
  for (const code of ["USD", "SAR", "AED"]) {
    const value = kwdPer[code];
    if (!value || !Number.isFinite(value) || value <= 0) {
      throw new Error(`missing ${code} rate`);
    }
  }
  const stale =
    Date.parse(`${publicationDate}T00:00:00Z`) <
    Date.parse(`${today}T00:00:00Z`) - 3 * 24 * 60 * 60 * 1000;
  return { publicationDate, kwdPer, stale };
}

export async function fetchCbkLatest(apiKey: string): Promise<FxTable> {
  const url = "https://allratestoday.com/api/v1/central-bank/cbk/latest";
  const today = kuwaitBusinessDate();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          Connection: "close",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`fx http ${response.status}`);
      }
      const body = await response.json();
      return parseCbkLatest(body, today);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fx provider failed");
}

function resolvePayload(raw: Record<string, unknown>): ErpJobPayload {
  const job = typeof raw.job === "string" ? raw.job : "";
  if (!isSchedulerJob(job)) {
    throw new Error(`erp: unknown job "${job}"`);
  }
  const runKey =
    typeof raw.runKey === "string" && raw.runKey.trim()
      ? raw.runKey.trim()
      : undefined;
  const scheduleName =
    typeof raw.scheduleName === "string" ? raw.scheduleName : undefined;
  return { job, runKey, scheduleName };
}

/**
 * Port of functions/erp-scheduler — trusted in-process worker path.
 * Fans out to every active company via run_scheduled_company_job.
 */
export async function runErpScheduledJob(
  input: ErpJobPayload,
  admin: AdminClient = createInsForgeAdminClient(),
): Promise<ErpRunResult> {
  const startedAt = Date.now();
  const job = input.job;
  const runKey = input.runKey?.trim() || kuwaitBusinessDate();

  const companies = await admin.database
    .from("companies")
    .select("id")
    .eq("status", "active");
  if (companies.error) {
    throw new Error(`erp: company list failed: ${companies.error.message}`);
  }
  // Skip the __platform__ carrier used for global schedule enqueue rows.
  const companyIds = ((companies.data ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => id !== PLATFORM_JOBS_COMPANY_ID);

  let payload: Record<string, unknown> = {};
  if (job === "fx_ingest") {
    const fxKey = process.env.FX_RATES_API_KEY ?? "";
    if (!fxKey) {
      payload = { fetchFailed: true, error: "missing_fx_key" };
    } else {
      try {
        const table = await fetchCbkLatest(fxKey);
        payload = {
          publicationDate: table.publicationDate,
          kwdPer: table.kwdPer,
          stale: table.stale,
        };
      } catch {
        payload = { fetchFailed: true, error: "fx_provider" };
      }
    }
  }

  const results = await mapPool(companyIds, 4, async (companyId) => {
    const { data, error } = await admin.database.rpc("run_scheduled_company_job", {
      p_company_id: companyId,
      p_job_name: job,
      p_run_key: runKey,
      p_payload: payload,
    });
    if (error) {
      return {
        companyId,
        status: "failed",
        error: "rpc_error",
      } satisfies ErpCompanyResult;
    }
    const row = (data ?? {}) as {
      status?: string;
      runId?: string;
      errorMessage?: string;
    };
    return {
      companyId,
      status: row.status ?? "failed",
      runId: row.runId,
      error: row.errorMessage,
    } satisfies ErpCompanyResult;
  });

  const succeeded = results.filter((row) => row.status === "succeeded").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  const failed = results.filter((row) => row.status === "failed").length;

  console.info({
    function: "erp-handler",
    operation: job,
    scheduleName: input.scheduleName,
    runKey,
    succeeded,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
  });

  if (failed > 0) {
    throw new Error(
      `erp: ${job} runKey=${runKey} failed=${failed} succeeded=${succeeded} skipped=${skipped}`,
    );
  }

  return { job, runKey, succeeded, failed, skipped, companies: results };
}

/** Worker registry entry for job type `erp`. */
export async function handleErpJob(job: JobRow): Promise<void> {
  const payload = resolvePayload(
    (job.payload ?? {}) as Record<string, unknown>,
  );
  await runErpScheduledJob(payload);
}
