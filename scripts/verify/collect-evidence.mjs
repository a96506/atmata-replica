#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureRunId,
  loadEnv,
  parseCliJson,
  redactSecrets,
  resultsDir,
  runCli,
  safeProjectIdentity,
  writeJson,
} from "./lib.mjs";

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function asList(payload, keys = ["data", "functions", "schedules", "items"]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function collectEvidence({ startedAt = new Date().toISOString() } = {}) {
  loadEnv();
  const runId = ensureRunId();
  const dir = resultsDir(runId);

  const current = parseCliJson(runCli(["current", "--json"]).stdout);
  const identity = safeProjectIdentity(current);

  let functions = [];
  let schedules = [];
  try {
    functions = asList(parseCliJson(runCli(["--json", "functions", "list"]).stdout));
  } catch (error) {
    functions = [{ error: redactSecrets(String(error.message ?? error)) }];
  }
  try {
    schedules = asList(parseCliJson(runCli(["--json", "schedules", "list"]).stdout));
  } catch (error) {
    schedules = [{ error: redactSecrets(String(error.message ?? error)) }];
  }

  const context = {
    startedAt,
    runId,
    gitSha: gitSha(),
    node: process.version,
    npm: (() => {
      try {
        return execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    })(),
    backend: {
      branch: identity.projectName,
      appKey: identity.appkey,
      region: identity.region,
      ossHost: identity.ossHost,
    },
    functionCount: functions.filter((f) => !f.error).length,
    scheduleCount: schedules.filter((s) => !s.error).length,
  };

  writeJson(resolve(dir, "context.json"), context);
  writeJson(
    resolve(dir, "functions.json"),
    functions.map((f) => ({
      name: f.name ?? f.slug ?? f.functionName ?? null,
      status: f.status ?? f.state ?? null,
    })),
  );
  writeJson(
    resolve(dir, "schedules.json"),
    schedules.map((s) => ({
      name: s.name ?? s.job_name ?? null,
      cron: s.cronSchedule ?? s.cron ?? s.schedule ?? null,
      active: s.isActive ?? s.active ?? null,
      id: s.id ?? null,
    })),
  );

  return context;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const context = collectEvidence();
    console.log(
      JSON.stringify(
        {
          ok: true,
          runId: context.runId,
          gitSha: context.gitSha,
          backend: context.backend,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(redactSecrets(error.message ?? String(error)));
    process.exit(1);
  }
}
