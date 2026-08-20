#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureRunId,
  loadEnv,
  mutationAllowed,
  redactSecrets,
  resultsDir,
  runCli,
  writeJson,
} from "./lib.mjs";

/**
 * Safe cleanup: only acts on IDs recorded in database-after.json for this run.
 * Residue scan is best-effort via CLI when mutation is allowed; otherwise no-op.
 */
export function runCleanup() {
  loadEnv();
  const runId = ensureRunId();
  const dir = resultsDir(runId);
  const afterPath = resolve(dir, "database-after.json");

  let fixtureIds = [];
  if (existsSync(afterPath)) {
    try {
      const after = JSON.parse(readFileSync(afterPath, "utf8"));
      fixtureIds = Array.isArray(after.ids)
        ? after.ids
        : Array.isArray(after.fixtureIds)
          ? after.fixtureIds
          : [];
    } catch {
      fixtureIds = [];
    }
  }

  const actions = [];
  let residualRows = 0;
  let residualObjects = 0;

  if (!fixtureIds.length) {
    actions.push({
      action: "noop",
      reason: "no database-after.json fixture IDs present",
    });
  } else if (!mutationAllowed()) {
    actions.push({
      action: "skipped",
      reason: "VERIFY_ALLOW_MUTATION not set; refusing destructive cleanup",
      fixtureCount: fixtureIds.length,
    });
  } else {
    // Record planned deletes only — actual row deletes require admin SQL with
    // explicit ID lists. Prefer documenting for operators over blind DELETE.
    for (const entry of fixtureIds) {
      actions.push({
        action: "planned",
        table: entry.table ?? null,
        id: entry.id ?? null,
        verifyRunId: runId,
        status: "not_executed_auto",
        note: "Automatic DELETE disabled; use reviewed operator script with explicit IDs.",
      });
    }
  }

  // Best-effort residue probe: count companies whose name contains the run id.
  if (mutationAllowed()) {
    try {
      const sql = `select count(*)::int as n from public.companies where name ilike '%${runId.replace(/'/g, "''")}%'`;
      const raw = runCli(["db", "query", sql], { allowFail: true });
      if (raw.ok) {
        const text = raw.stdout;
        const match = text.match(/"n"\s*:\s*(\d+)/) || text.match(/\b(\d+)\b/);
        if (match) residualRows = Number(match[1]);
        actions.push({ action: "residue_scan_companies", residualRows, ok: true });
      } else {
        actions.push({
          action: "residue_scan_companies",
          ok: false,
          error: "query failed",
        });
      }
    } catch (error) {
      actions.push({
        action: "residue_scan_companies",
        ok: false,
        error: redactSecrets(String(error.message ?? error)),
      });
    }
  }

  const result = {
    result: residualRows > 0 && fixtureIds.length ? "fail" : "pass",
    runId,
    residualRows,
    residualObjects,
    fixtureIdCount: fixtureIds.length,
    actions,
  };

  // No fixtures → safe pass
  if (!fixtureIds.length) result.result = "pass";

  writeJson(resolve(dir, "cleanup.json"), result);
  return result;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const result = runCleanup();
    console.log(JSON.stringify({ ok: result.result === "pass", ...result }, null, 2));
    if (result.result === "fail") process.exit(1);
  } catch (error) {
    console.error(redactSecrets(error.message ?? String(error)));
    process.exit(1);
  }
}
