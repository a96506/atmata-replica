#!/usr/bin/env node
/**
 * Reconcile InsForge *platform* schedules against ops/insforge/schedules.json.
 *
 * Phase 2 fold complete: ERP cadence lives in-app (public.schedules + node-cron).
 * Edge erp-scheduler was deleted. Default this script with active=false.
 * Prefer leaving InsForge schedules inactive so they do not double-fire.
 *
 * If using --activate for emergency HTTP kick, set ops url to an absolute
 * Railway URL: https://…/api/cron/erp (manifest path alone is not enough).
 *
 * Usage:
 *   node scripts/reconcile-insforge-schedules.mjs          # create/update, active=false
 *   node scripts/reconcile-insforge-schedules.mjs --activate  # active=true (transition only)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "ops/insforge/schedules.json"), "utf8"),
);
const activate = process.argv.includes("--activate");
const desiredActive = activate;

if (manifest._fold?.retireInsForgePlatformSchedules && activate) {
  console.warn(
    "[reconcile-insforge-schedules] WARNING: activating InsForge platform schedules after Phase 2 fold may double-fire with in-app node-cron. Prefer --activate only while pointing url at Railway /api/cron/erp and SCHEDULES_CRON_ENABLED=false.",
  );
}

function cli(args, extra = {}) {
  return execFileSync("npx", ["@insforge/cli", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
}

function parseJson(text) {
  const start = text.indexOf("{") >= 0 && text.indexOf("{") < (text.indexOf("[") === -1 ? Infinity : text.indexOf("["))
    ? text.indexOf("{")
    : text.indexOf("[");
  if (start < 0) throw new Error(`no JSON in CLI output:\n${text}`);
  return JSON.parse(text.slice(start));
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.schedules)) return payload.schedules;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

const listed = asList(parseJson(cli(["schedules", "list", "--json"])));
const byName = new Map(
  listed.map((row) => [row.name ?? row.job_name, row]),
);

const headers = JSON.stringify(manifest.headers);
const scheduleUrl =
  process.env.INSFORGE_SCHEDULE_KICK_URL ??
  (typeof manifest.url === "string" && manifest.url.startsWith("http")
    ? manifest.url
    : null);

if (!scheduleUrl) {
  console.warn(
    "[reconcile-insforge-schedules] Skipping create/update: set INSFORGE_SCHEDULE_KICK_URL to an absolute Railway URL (…/api/cron/erp). Edge erp-scheduler is deleted; relative manifest.url is not deployable to InsForge schedules.",
  );
  process.exit(0);
}

for (const entry of manifest.schedules) {
  const body = JSON.stringify(entry.body);
  const existing = byName.get(entry.name);
  if (!existing) {
    cli([
      "schedules",
      "create",
      "--name",
      entry.name,
      "--cron",
      entry.cron,
      "--url",
      scheduleUrl,
      "--method",
      manifest.method,
      "--headers",
      headers,
      "--body",
      body,
      "--json",
    ]);
    const created = asList(parseJson(cli(["schedules", "list", "--json"]))).find(
      (row) => (row.name ?? row.job_name) === entry.name,
    );
    if (created?.id) {
      cli([
        "schedules",
        "update",
        String(created.id),
        "--active",
        String(desiredActive),
        "--json",
      ]);
    }
    console.log(`${entry.name}: created active=${desiredActive}`);
    continue;
  }
  const id = String(existing.id);
  cli([
    "schedules",
    "update",
    id,
    "--name",
    entry.name,
    "--cron",
    entry.cron,
    "--url",
    scheduleUrl,
    "--method",
    manifest.method,
    "--headers",
    headers,
    "--body",
    body,
    "--active",
    String(desiredActive),
    "--json",
  ]);
  console.log(`${entry.name}: updated ${id} active=${desiredActive}`);
}
