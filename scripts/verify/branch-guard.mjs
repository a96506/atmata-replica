#!/usr/bin/env node
/**
 * Branch / identity / mutation / URL preflight for release verification.
 * Never prints secrets (passwords, API keys, JWT, branch DB credentials).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_APPKEY,
  EXPECTED_BRANCH,
  RUN_ID_RE,
  isBlockedProductionUrl,
  loadEnv,
  mutationAllowed,
  parseCliJson,
  redactSecrets,
  runCli,
  safeProjectIdentity,
} from "./lib.mjs";

export function assertBranchGuard({ requireMutation = false } = {}) {
  loadEnv();

  const errors = [];
  const runId = process.env.VERIFY_RUN_ID;
  if (!runId || !RUN_ID_RE.test(runId)) {
    errors.push(
      `VERIFY_RUN_ID missing or invalid (need ${RUN_ID_RE.source})`,
    );
  }

  const baseUrl =
    process.env.VERIFY_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://127.0.0.1:3000";
  if (isBlockedProductionUrl(baseUrl)) {
    errors.push(`VERIFY_BASE_URL looks like production: ${baseUrl}`);
  }

  let current;
  let branches;
  try {
    current = parseCliJson(runCli(["current", "--json"]).stdout);
  } catch (error) {
    errors.push(`current --json failed: ${redactSecrets(String(error.message))}`);
  }
  try {
    branches = parseCliJson(runCli(["branch", "list", "--json"]).stdout);
  } catch (error) {
    errors.push(`branch list --json failed: ${redactSecrets(String(error.message))}`);
  }

  const identity = safeProjectIdentity(current);
  if (identity.projectName !== EXPECTED_BRANCH) {
    errors.push(
      `active project is ${identity.projectName ?? "unknown"}, expected ${EXPECTED_BRANCH}`,
    );
  }
  if (identity.appkey !== EXPECTED_APPKEY) {
    errors.push(
      `appkey is ${identity.appkey ?? "unknown"}, expected ${EXPECTED_APPKEY}`,
    );
  }

  const list = Array.isArray(branches?.data)
    ? branches.data
    : Array.isArray(branches)
      ? branches
      : [];
  const branchRow = list.find(
    (row) =>
      (row.name ?? row.project_name) === EXPECTED_BRANCH ||
      row.appkey === EXPECTED_APPKEY,
  );
  if (!branchRow) {
    errors.push(`${EXPECTED_BRANCH} missing from branch list`);
  } else {
    const state = branchRow.branch_state ?? branchRow.status;
    if (state && !["ready", "active"].includes(String(state))) {
      errors.push(`${EXPECTED_BRANCH} branch_state/status is ${state}, expected ready/active`);
    }
  }

  const wantsMutation = requireMutation || Boolean(process.env.VERIFY_ALLOW_MUTATION);
  if (wantsMutation && !mutationAllowed()) {
    errors.push(
      `VERIFY_ALLOW_MUTATION must equal ${EXPECTED_BRANCH} for mutation mode (got ${process.env.VERIFY_ALLOW_MUTATION ?? "unset"})`,
    );
  }

  if (errors.length) {
    const err = new Error(errors.join("\n"));
    err.details = {
      ok: false,
      branch: identity.projectName,
      appkey: identity.appkey,
      baseUrl,
      runId: runId ?? null,
      mutationAllowed: mutationAllowed(),
      errors,
    };
    throw err;
  }

  return {
    ok: true,
    branch: EXPECTED_BRANCH,
    appkey: EXPECTED_APPKEY,
    baseUrl,
    runId,
    mutationAllowed: mutationAllowed(),
    identity,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const result = assertBranchGuard({
      requireMutation: process.argv.includes("--mutation"),
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          branch: result.branch,
          appkey: result.appkey,
          baseUrl: result.baseUrl,
          runId: result.runId,
          mutationAllowed: result.mutationAllowed,
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
