#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const EXPECTED_BRANCH = "erp-backend-v1";
export const EXPECTED_APPKEY = "yfmw4i43-9rc";
export const RUN_ID_RE = /^vf_[0-9]{8}_[a-z0-9]{6}$/;

const SECRET_ENV_KEYS = [
  "PASSWORD",
  "SECRET",
  "TOKEN",
  "API_KEY",
  "ANON_KEY",
  "ACCESS_TOKEN",
  "JWT",
];

/** Load `.env.local` then map PLATFORM_ADMIN_* → VERIFY_PLATFORM_* when unset. */
export function loadEnv() {
  const envPath = resolve(ROOT, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  if (!process.env.VERIFY_PLATFORM_EMAIL && process.env.PLATFORM_ADMIN_EMAIL) {
    process.env.VERIFY_PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL;
  }
  if (!process.env.VERIFY_PLATFORM_PASSWORD && process.env.PLATFORM_ADMIN_PASSWORD) {
    process.env.VERIFY_PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;
  }
  if (!process.env.INSFORGE_URL && process.env.NEXT_PUBLIC_INSFORGE_URL) {
    process.env.INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
  }
  if (!process.env.INSFORGE_ANON_KEY && process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY) {
    process.env.INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  }
}

export function ensureRunId() {
  const id = process.env.VERIFY_RUN_ID;
  if (!id || !RUN_ID_RE.test(id)) {
    throw new Error(
      `VERIFY_RUN_ID required and must match ${RUN_ID_RE}. Example: vf_$(date -u +%Y%m%d)_$(openssl rand -hex 3)`,
    );
  }
  return id;
}

export function resultsDir(runId = process.env.VERIFY_RUN_ID) {
  if (!runId) throw new Error("VERIFY_RUN_ID is required for resultsDir");
  const dir = resolve(ROOT, "verification/results", runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function appendNdjson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function redactSecrets(text) {
  if (!text) return "";
  let out = String(text);
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (!SECRET_ENV_KEYS.some((part) => key.toUpperCase().includes(part))) continue;
    out = out.split(value).join(`[redacted:${key}]`);
  }
  // Common JWT / key shapes
  out = out.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    "[redacted:jwt]",
  );
  out = out.replace(
    /"(database_password|jwt_secret|access_api_key|password|apiKey|token)"\s*:\s*"[^"]+"/gi,
    '"$1":"[redacted]"',
  );
  return out;
}

export function parseCliJson(text) {
  const raw = String(text ?? "");
  const objIdx = raw.indexOf("{");
  const arrIdx = raw.indexOf("[");
  let start = -1;
  if (objIdx >= 0 && (arrIdx < 0 || objIdx < arrIdx)) start = objIdx;
  else if (arrIdx >= 0) start = arrIdx;
  if (start < 0) {
    throw new Error(`no JSON in CLI output:\n${redactSecrets(raw.slice(0, 500))}`);
  }
  return JSON.parse(raw.slice(start));
}

export function runCli(args, { timeoutMs = 120_000, allowFail = false } = {}) {
  const started = Date.now();
  let result;
  try {
    const stdout = execFileSync("npx", ["@insforge/cli", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    result = { ok: true, code: 0, stdout, stderr: "", durationMs: Date.now() - started };
  } catch (error) {
    result = {
      ok: false,
      code: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : String(error.message ?? error),
      durationMs: Date.now() - started,
    };
    if (!allowFail) {
      const msg = redactSecrets(`${result.stderr}\n${result.stdout}`.trim());
      throw new Error(`insforge ${args.join(" ")} failed (exit ${result.code}): ${msg}`);
    }
  }
  return result;
}

export function runNpm(scriptArgs, { timeoutMs = 600_000 } = {}) {
  const started = Date.now();
  const result = spawnSync("npm", scriptArgs, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    timeout: timeoutMs,
  });
  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - started,
  };
}

export function mutationAllowed() {
  return process.env.VERIFY_ALLOW_MUTATION === EXPECTED_BRANCH;
}

export function isBlockedProductionUrl(url) {
  if (!url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return false;
  }
  // Preview vercel URLs are allowed; bare production custom domains / main prod blocked.
  if (host.endsWith(".vercel.app")) {
    // Treat *-git-* and project preview hosts as previews; block obvious production aliases.
    if (
      host === "atmata.com" ||
      host.startsWith("www.") ||
      /-(production|prod|main)\./.test(host) ||
      host === "atmata.vercel.app"
    ) {
      return true;
    }
    return false;
  }
  if (
    host === "atmata.com" ||
    host === "www.atmata.com" ||
    host.endsWith(".atmata.com")
  ) {
    return true;
  }
  return false;
}

export function safeProjectIdentity(payload) {
  const project = payload?.project ?? payload;
  return {
    projectId: project?.project_id ?? project?.id ?? null,
    projectName: project?.project_name ?? project?.name ?? null,
    appkey: project?.appkey ?? null,
    region: project?.region ?? null,
    ossHost: project?.oss_host ?? null,
    branchState: project?.branch_state ?? null,
    status: project?.status ?? null,
  };
}

/** Strip SQL comments so CLI argv parsers do not treat `--` as flags. */
export function sqlForCli(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--[^\n]*$/gm, " ")
    .replace(/\n+/g, " ")
    .trim();
}
