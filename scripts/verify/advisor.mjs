#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  ensureRunId,
  loadEnv,
  parseCliJson,
  redactSecrets,
  resultsDir,
  runCli,
  writeJson,
} from "./lib.mjs";

function waivers() {
  const path = resolve(ROOT, "verification/waivers.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(raw) ? raw : Array.isArray(raw.waivers) ? raw.waivers : [];
}

function isWaived(issue, list) {
  return list.some((w) => {
    if (w.issueId && w.issueId === issue.id) return true;
    if (
      w.ruleId &&
      w.ruleId === issue.ruleId &&
      w.affectedObject === issue.affectedObject
    ) {
      return true;
    }
    if (w.ruleId && w.ruleId === issue.ruleId && !w.affectedObject) return true;
    return false;
  });
}

function summarizeIssues(payload) {
  if (Array.isArray(payload?.issues)) return payload.issues;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function runAdvisor() {
  loadEnv();
  const runId = ensureRunId();
  const dir = resultsDir(runId);
  const waiverList = waivers();

  const securityRaw = runCli([
    "--json",
    "diagnose",
    "advisor",
    "--category",
    "security",
    "--limit",
    "500",
  ]);
  const fullRaw = runCli(["--json", "diagnose", "advisor", "--limit", "500"]);

  const security = parseCliJson(securityRaw.stdout);
  const full = parseCliJson(fullRaw.stdout);

  writeJson(resolve(dir, "advisor-security.json"), security);
  writeJson(resolve(dir, "advisor-full.json"), full);

  const securityIssues = summarizeIssues(security);
  const blocking = securityIssues.filter((issue) => {
    const sev = String(issue.severity ?? "").toLowerCase();
    if (sev !== "critical" && sev !== "warning") return false;
    return !isWaived(issue, waiverList);
  });

  const result = {
    ok: blocking.length === 0,
    runId,
    securitySummary: security?.scan?.summary ?? null,
    fullSummary: full?.scan?.summary ?? null,
    unresolvedSecurity: blocking.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      severity: i.severity,
      title: i.title,
      affectedObject: i.affectedObject,
    })),
    waiverCount: waiverList.length,
  };

  writeJson(resolve(dir, "advisor-gate.json"), result);
  return result;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const result = runAdvisor();
    if (!result.ok) {
      console.error(
        `advisor gate failed: ${result.unresolvedSecurity.length} unresolved security finding(s)`,
      );
      for (const issue of result.unresolvedSecurity.slice(0, 20)) {
        console.error(
          `- [${issue.severity}] ${issue.ruleId}: ${issue.affectedObject ?? issue.title}`,
        );
      }
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          securitySummary: result.securitySummary,
          waiverCount: result.waiverCount,
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
