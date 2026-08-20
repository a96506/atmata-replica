#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureRunId,
  loadEnv,
  redactSecrets,
  resultsDir,
  writeJson,
} from "./lib.mjs";

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function walkFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(full);
  }
  return out;
}

export function buildReport() {
  loadEnv();
  const runId = ensureRunId();
  const dir = resultsDir(runId);

  const readOptional = (name) => {
    const path = resolve(dir, name);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  };

  const gates = readOptional("gates.json") ?? [];
  const cleanup = readOptional("cleanup.json");
  const context = readOptional("context.json");
  const advisor = readOptional("advisor-gate.json");

  const failed = gates.filter((g) => g.result === "fail");
  const blocked = gates.filter((g) => g.result === "blocked");
  let result = "pass";
  if (failed.length) result = "fail";
  else if (blocked.length) result = "blocked";
  if (cleanup && cleanup.result === "fail") result = "fail";

  let gitSha = context?.gitSha ?? null;
  if (!gitSha) {
    try {
      gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
    } catch {
      gitSha = null;
    }
  }

  const report = {
    runId,
    startedAt: context?.startedAt ?? null,
    finishedAt: new Date().toISOString(),
    gitSha,
    backend: context?.backend ?? {
      branch: process.env.VERIFY_ALLOW_MUTATION ?? null,
      appKey: null,
    },
    result,
    gates,
    waivers: readOptional("advisor-gate.json")?.waiverCount
      ? [{ note: "see verification/waivers.json", count: advisor.waiverCount }]
      : [],
    cleanup: cleanup ?? { result: "skipped", residualRows: 0, residualObjects: 0 },
    advisor: advisor
      ? {
          ok: advisor.ok,
          unresolvedSecurity: advisor.unresolvedSecurity?.length ?? 0,
        }
      : null,
  };

  writeJson(resolve(dir, "report.json"), report);

  const lines = [
    `# Verification report ${runId}`,
    "",
    `- Result: **${result}**`,
    `- Git SHA: \`${gitSha ?? "unknown"}\``,
    `- Backend: ${report.backend?.branch ?? "?"} / ${report.backend?.appKey ?? "?"}`,
    `- Finished: ${report.finishedAt}`,
    "",
    "## Gates",
    "",
    "| Gate | Result | Duration |",
    "| --- | --- | --- |",
    ...gates.map(
      (g) =>
        `| ${g.id} | ${g.result} | ${g.durationMs ?? "—"}ms |`,
    ),
    "",
    "## Cleanup",
    "",
    `- Result: ${report.cleanup.result}`,
    `- Residual rows: ${report.cleanup.residualRows ?? 0}`,
    `- Residual objects: ${report.cleanup.residualObjects ?? 0}`,
    "",
    "## Advisor",
    "",
    advisor
      ? `- Unresolved security: ${advisor.unresolvedSecurity?.length ?? 0}`
      : "- Not run",
    "",
  ];
  writeFileSync(resolve(dir, "report.md"), `${lines.join("\n")}\n`, "utf8");

  const sums = [];
  for (const file of walkFiles(dir).sort()) {
    if (file.endsWith("sha256sums.txt")) continue;
    const rel = file.slice(dir.length + 1);
    sums.push(`${sha256File(file)}  ${rel}`);
  }
  writeFileSync(resolve(dir, "sha256sums.txt"), `${sums.join("\n")}\n`, "utf8");

  return report;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const report = buildReport();
    console.log(JSON.stringify({ ok: report.result !== "fail", result: report.result }, null, 2));
    if (report.result === "fail") process.exit(1);
  } catch (error) {
    console.error(redactSecrets(error.message ?? String(error)));
    process.exit(1);
  }
}
