#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "ops/insforge/schedules.json"), "utf8"),
);

function cli(args) {
  return execFileSync("npx", ["@insforge/cli", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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
const byName = new Map(listed.map((row) => [row.name ?? row.job_name, row]));
const errors = [];

for (const entry of manifest.schedules) {
  const row = byName.get(entry.name);
  if (!row) {
    errors.push(`missing schedule ${entry.name}`);
    continue;
  }
  const cron = row.cronSchedule ?? row.cron ?? row.schedule ?? row.expression;
  const url = row.functionUrl ?? row.url ?? row.targetUrl;
  const method = row.httpMethod ?? row.method;
  const body = typeof row.body === "string" ? row.body : JSON.stringify(row.body ?? {});
  if (cron !== entry.cron) errors.push(`${entry.name} cron ${cron} != ${entry.cron}`);
  if (url !== manifest.url) errors.push(`${entry.name} url ${url} != ${manifest.url}`);
  if (String(method).toUpperCase() !== manifest.method) {
    errors.push(`${entry.name} method ${method} != ${manifest.method}`);
  }
  if (!body.includes(entry.body.job)) {
    errors.push(`${entry.name} body missing job ${entry.body.job}`);
  }
  if (row.isActive === false || row.active === false) {
    console.log(`${entry.name}: inactive (definition ok)`);
  }
  try {
    if (row.id) cli(["schedules", "logs", String(row.id), "--limit", "5", "--json"]);
  } catch (error) {
    console.log(`${entry.name}: no logs yet`);
  }
}

if (listed.length !== manifest.schedules.length) {
  errors.push(
    `live count ${listed.length} != manifest ${manifest.schedules.length}`,
  );
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`verified ${manifest.schedules.length} schedules`);
