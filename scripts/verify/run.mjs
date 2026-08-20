#!/usr/bin/env node
/**
 * Ordered release-verification runner.
 * Always runs cleanup in finally; exits nonzero on any failed gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBranchGuard } from "./branch-guard.mjs";
import { runAdvisor } from "./advisor.mjs";
import { collectEvidence } from "./collect-evidence.mjs";
import { runCleanup } from "./cleanup.mjs";
import { buildReport } from "./report.mjs";
import {
  ROOT,
  appendNdjson,
  ensureRunId,
  loadEnv,
  mutationAllowed,
  parseCliJson,
  redactSecrets,
  resultsDir,
  runCli,
  runNpm,
  sqlForCli,
  writeJson,
} from "./lib.mjs";

function recordGate(gates, entry) {
  gates.push(entry);
  appendNdjson(resolve(resultsDir(), "commands.ndjson"), {
    at: new Date().toISOString(),
    ...entry,
  });
}

function runSchemaContract(dir) {
  const sqlPath = resolve(ROOT, "scripts/verify/schema-contract.sql");
  const sql = sqlForCli(readFileSync(sqlPath, "utf8"));
  // Prefer CLI db query with unrestricted (information_schema / pg_catalog).
  const raw = runCli(["--json", "db", "query", "--unrestricted", sql], {
    allowFail: true,
  });
  if (!raw.ok) {
    // Fallback: admin SQL via INSFORGE_API_KEY is not wired as a generic HTTP
    // endpoint here; record blocked status for operators.
    const blocked = {
      ok: false,
      status: "blocked",
      reason: "insforge db query failed; set CLI link and retry",
      stderr: redactSecrets(raw.stderr || raw.stdout || "").slice(0, 2000),
    };
    writeJson(resolve(dir, "schema-contract.json"), blocked);
    return {
      id: "SCHEMA-CONTRACT",
      result: "blocked",
      durationMs: raw.durationMs,
      failure: blocked.reason,
      evidence: ["schema-contract.json"],
    };
  }

  let payload;
  try {
    payload = parseCliJson(raw.stdout);
  } catch (error) {
    const blocked = {
      ok: false,
      status: "blocked",
      reason: redactSecrets(String(error.message ?? error)),
      stdout: redactSecrets(raw.stdout).slice(0, 2000),
    };
    writeJson(resolve(dir, "schema-contract.json"), blocked);
    return {
      id: "SCHEMA-CONTRACT",
      result: "blocked",
      durationMs: raw.durationMs,
      failure: blocked.reason,
      evidence: ["schema-contract.json"],
    };
  }

  // Normalize: { rows: [{ schema_contract }] } or array wrappers
  let contract = payload;
  if (Array.isArray(payload?.rows) && payload.rows[0]?.schema_contract) {
    contract = payload.rows[0].schema_contract;
  } else if (Array.isArray(payload)) {
    contract = payload[0]?.schema_contract ?? payload[0] ?? payload;
  } else if (payload?.schema_contract) {
    contract = payload.schema_contract;
  } else if (Array.isArray(payload?.data)) {
    contract = payload.data[0]?.schema_contract ?? payload.data[0] ?? payload;
  }

  writeJson(resolve(dir, "schema-contract.json"), contract);

  const rlsPath = resolve(ROOT, "scripts/verify/rls-inventory.sql");
  if (existsSync(rlsPath)) {
    const rlsRaw = runCli(
      [
        "--json",
        "db",
        "query",
        "--unrestricted",
        sqlForCli(readFileSync(rlsPath, "utf8")),
      ],
      { allowFail: true },
    );
    if (rlsRaw.ok) {
      try {
        writeJson(resolve(dir, "rls-inventory.json"), parseCliJson(rlsRaw.stdout));
      } catch {
        /* optional */
      }
    }
  }

  const ok = contract?.ok === true || contract?.ok === "t" || contract?.ok === "true";
  return {
    id: "SCHEMA-CONTRACT",
    result: ok ? "pass" : "fail",
    durationMs: raw.durationMs,
    failure: ok
      ? null
      : "schema contract reported ok=false (see schema-contract.json)",
    evidence: ["schema-contract.json"],
  };
}

async function main() {
  loadEnv();
  const startedAt = new Date().toISOString();
  process.env.VERIFY_RUN_ID = ensureRunId();
  const runId = process.env.VERIFY_RUN_ID;
  const dir = resultsDir(runId);
  const gates = [];
  let fatal = null;

  try {
    // 1. Guard
    {
      const t0 = Date.now();
      try {
        const guard = assertBranchGuard({ requireMutation: false });
        writeJson(resolve(dir, "branch-guard.json"), guard);
        recordGate(gates, {
          id: "BRANCH-GUARD",
          result: "pass",
          durationMs: Date.now() - t0,
          evidence: ["branch-guard.json"],
          failure: null,
        });
      } catch (error) {
        writeJson(resolve(dir, "branch-guard.json"), error.details ?? { error: error.message });
        recordGate(gates, {
          id: "BRANCH-GUARD",
          result: "fail",
          durationMs: Date.now() - t0,
          evidence: ["branch-guard.json"],
          failure: error.message,
        });
        throw error;
      }
    }

    // 2. Collect baseline evidence
    {
      const t0 = Date.now();
      const context = collectEvidence({ startedAt });
      recordGate(gates, {
        id: "COLLECT-EVIDENCE",
        result: "pass",
        durationMs: Date.now() - t0,
        evidence: ["context.json", "functions.json", "schedules.json"],
        failure: null,
        assertions: 1,
      });
      void context;
    }

    // 3. Migrations up --all twice
    {
      const t0 = Date.now();
      const first = runCli(["db", "migrations", "up", "--all"], { allowFail: true });
      const second = runCli(["db", "migrations", "up", "--all"], { allowFail: true });
      writeJson(resolve(dir, "migrations.json"), {
        first: {
          ok: first.ok,
          code: first.code,
          stdout: redactSecrets(first.stdout).slice(0, 4000),
          stderr: redactSecrets(first.stderr).slice(0, 2000),
        },
        second: {
          ok: second.ok,
          code: second.code,
          stdout: redactSecrets(second.stdout).slice(0, 4000),
          stderr: redactSecrets(second.stderr).slice(0, 2000),
        },
      });
      const ok = first.ok && second.ok;
      recordGate(gates, {
        id: "MIGRATIONS-UP",
        result: ok ? "pass" : "fail",
        durationMs: Date.now() - t0,
        evidence: ["migrations.json"],
        failure: ok ? null : "db migrations up --all failed",
      });
      if (!ok) throw new Error("migrations gate failed");
    }

    // 4. Schema contract
    {
      const gate = runSchemaContract(dir);
      recordGate(gates, gate);
      if (gate.result === "fail") throw new Error("schema contract failed");
      // blocked continues but marks overall blocked later
    }

    // 5. Advisor
    {
      const t0 = Date.now();
      const advisor = runAdvisor();
      recordGate(gates, {
        id: "ADVISOR",
        result: advisor.ok ? "pass" : "fail",
        durationMs: Date.now() - t0,
        evidence: ["advisor-security.json", "advisor-full.json", "advisor-gate.json"],
        failure: advisor.ok
          ? null
          : `${advisor.unresolvedSecurity.length} unresolved security findings`,
      });
      if (!advisor.ok) throw new Error("advisor gate failed");
    }

    // 6. Typecheck + build
    {
      const t0 = Date.now();
      const typecheck = runNpm(["run", "typecheck"]);
      const build = typecheck.ok ? runNpm(["run", "build"]) : { ok: false, code: 1, stdout: "", stderr: "skipped after typecheck fail", durationMs: 0 };
      writeJson(resolve(dir, "typecheck-build.json"), {
        typecheck: {
          ok: typecheck.ok,
          code: typecheck.code,
          durationMs: typecheck.durationMs,
          stderr: redactSecrets(typecheck.stderr).slice(0, 4000),
        },
        build: {
          ok: build.ok,
          code: build.code,
          durationMs: build.durationMs,
          stderr: redactSecrets(build.stderr).slice(0, 4000),
        },
      });
      const ok = typecheck.ok && build.ok;
      recordGate(gates, {
        id: "TYPECHECK-BUILD",
        result: ok ? "pass" : "fail",
        durationMs: Date.now() - t0,
        evidence: ["typecheck-build.json"],
        failure: ok ? null : "typecheck or build failed",
      });
      if (!ok) throw new Error("typecheck/build gate failed");
    }

    // 7. Playwright static
    {
      const t0 = Date.now();
      const staticRun = runNpm([
        "run",
        "verify:static",
        "--",
        `--output=${resolve(dir, "playwright-static")}`,
      ]);
      writeJson(resolve(dir, "playwright-static.json"), {
        ok: staticRun.ok,
        code: staticRun.code,
        stdout: redactSecrets(staticRun.stdout).slice(0, 8000),
        stderr: redactSecrets(staticRun.stderr).slice(0, 4000),
      });
      recordGate(gates, {
        id: "PLAYWRIGHT-STATIC",
        result: staticRun.ok ? "pass" : "fail",
        durationMs: Date.now() - t0,
        evidence: ["playwright-static.json"],
        failure: staticRun.ok ? null : "static verification tests failed",
      });
      if (!staticRun.ok) throw new Error("static playwright gate failed");
    }

    // 8. Mutation path: backend + browser
    if (mutationAllowed()) {
      {
        const t0 = Date.now();
        const backend = runNpm(["run", "verify:backend"]);
        writeJson(resolve(dir, "playwright-backend.json"), {
          ok: backend.ok,
          code: backend.code,
          stdout: redactSecrets(backend.stdout).slice(0, 8000),
          stderr: redactSecrets(backend.stderr).slice(0, 4000),
        });
        recordGate(gates, {
          id: "PLAYWRIGHT-BACKEND",
          result: backend.ok ? "pass" : "fail",
          durationMs: Date.now() - t0,
          evidence: ["playwright-backend.json"],
          failure: backend.ok ? null : "backend verification tests failed",
        });
        if (!backend.ok) throw new Error("backend playwright gate failed");
      }
      {
        const t0 = Date.now();
        const browser = runNpm(["run", "verify:browser"]);
        writeJson(resolve(dir, "playwright-browser.json"), {
          ok: browser.ok,
          code: browser.code,
          stdout: redactSecrets(browser.stdout).slice(0, 8000),
          stderr: redactSecrets(browser.stderr).slice(0, 4000),
        });
        recordGate(gates, {
          id: "PLAYWRIGHT-BROWSER",
          result: browser.ok ? "pass" : "fail",
          durationMs: Date.now() - t0,
          evidence: ["playwright-browser.json"],
          failure: browser.ok ? null : "browser verification tests failed",
        });
        if (!browser.ok) throw new Error("browser playwright gate failed");
      }
    } else {
      recordGate(gates, {
        id: "PLAYWRIGHT-BACKEND",
        result: "blocked",
        durationMs: 0,
        evidence: [],
        failure: "VERIFY_ALLOW_MUTATION not set to erp-backend-v1",
      });
      recordGate(gates, {
        id: "PLAYWRIGHT-BROWSER",
        result: "blocked",
        durationMs: 0,
        evidence: [],
        failure: "VERIFY_ALLOW_MUTATION not set to erp-backend-v1",
      });
    }
  } catch (error) {
    fatal = error;
  } finally {
    try {
      const t0 = Date.now();
      const cleanup = runCleanup();
      recordGate(gates, {
        id: "CLEANUP",
        result: cleanup.result === "pass" ? "pass" : "fail",
        durationMs: Date.now() - t0,
        evidence: ["cleanup.json"],
        failure: cleanup.result === "pass" ? null : "cleanup incomplete",
      });
    } catch (cleanupError) {
      recordGate(gates, {
        id: "CLEANUP",
        result: "fail",
        durationMs: 0,
        evidence: ["cleanup.json"],
        failure: redactSecrets(cleanupError.message ?? String(cleanupError)),
      });
    }

    writeJson(resolve(dir, "gates.json"), gates);
    try {
      buildReport();
    } catch (reportError) {
      console.error("report failed:", redactSecrets(reportError.message ?? String(reportError)));
    }
  }

  const failed = gates.some((g) => g.result === "fail");
  if (fatal || failed) {
    console.error(
      redactSecrets(fatal?.message ?? "verification failed — see report.json"),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        gates: gates.map((g) => ({ id: g.id, result: g.result })),
      },
      null,
      2,
    ),
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    console.error(redactSecrets(error.message ?? String(error)));
    process.exit(1);
  });
}
