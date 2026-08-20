import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JOBS = new Set([
  "fx_ingest",
  "aging_refresh",
  "stale_drafts",
  "month_end",
  "inventory_alerts",
  "depreciation",
]);

type JobName =
  | "fx_ingest"
  | "aging_refresh"
  | "stale_drafts"
  | "month_end"
  | "inventory_alerts"
  | "depreciation";

type CompanyResult = {
  companyId: string;
  status: string;
  runId?: string;
  error?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, requestId: string) {
  return json(status, {
    error: {
      code,
      messageKey:
        code === "UNAUTHENTICATED"
          ? "errors.unauthenticated"
          : code === "VALIDATION"
            ? "errors.validation"
            : "errors.internal",
      requestId,
      retryable: false,
    },
  });
}

function kuwaitBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function bearerToken(req: Request): string {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

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

type FxTable = {
  publicationDate: string;
  kwdPer: Record<string, number>;
  stale: boolean;
};

function parseCbkLatest(body: unknown, today: string): FxTable {
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

async function fetchCbkLatest(apiKey: string): Promise<FxTable> {
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

export default async function (req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return fail(405, "VALIDATION", requestId);

  const expected = Deno.env.get("SCHEDULE_CRON_TOKEN") ?? "";
  const provided = bearerToken(req);
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return fail(401, "UNAUTHENTICATED", requestId);
  }

  let body: { job?: string; runKey?: string } = {};
  try {
    body = (await req.json()) as { job?: string; runKey?: string };
  } catch {
    return fail(400, "VALIDATION", requestId);
  }
  const job = typeof body.job === "string" ? body.job : "";
  if (!JOBS.has(job)) return fail(400, "VALIDATION", requestId);
  const runKey =
    typeof body.runKey === "string" && body.runKey.trim()
      ? body.runKey.trim()
      : kuwaitBusinessDate();

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) return fail(500, "INTERNAL", requestId);

  const admin = createAdminClient({ baseUrl, apiKey });
  const companies = await admin.database
    .from("companies")
    .select("id")
    .eq("status", "active");
  if (companies.error) {
    console.info({
      requestId,
      function: "erp-scheduler",
      resultCode: "COMPANY_LIST_FAILED",
      durationMs: Date.now() - startedAt,
    });
    return fail(500, "INTERNAL", requestId);
  }
  const companyIds = ((companies.data ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  let payload: Record<string, unknown> = {};
  if (job === "fx_ingest") {
    const fxKey = Deno.env.get("FX_RATES_API_KEY") ?? "";
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
      } satisfies CompanyResult;
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
    } satisfies CompanyResult;
  });

  const succeeded = results.filter((row) => row.status === "succeeded").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  const failed = results.filter((row) => row.status === "failed").length;

  console.info({
    requestId,
    function: "erp-scheduler",
    operation: job,
    runKey,
    succeeded,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
  });

  return json(failed > 0 ? 500 : 200, {
    job: job as JobName,
    runKey,
    succeeded,
    failed,
    skipped,
    companies: results,
  });
}
