#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "ops/insforge/schedules.json"), "utf8"),
);
const activate = process.argv.includes("--activate");
const desiredActive = activate;

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
      manifest.url,
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
    manifest.url,
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
