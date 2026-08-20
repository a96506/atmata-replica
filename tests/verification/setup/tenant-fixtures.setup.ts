import { test as setup } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadLocalEnv,
  mutationAllowed,
  platformAccount,
  tenantAOwner,
  tenantBOwner,
  verifyRunId,
} from "../fixtures/accounts";
import { provisionVerifyCompany } from "../fixtures/erp-fixture";

loadLocalEnv();

setup("provision tenant fixtures A/B", async () => {
  setup.skip(
    !mutationAllowed(),
    "VERIFY_ALLOW_MUTATION!=erp-backend-v1 — skipping tenant fixture provision",
  );
  setup.skip(!verifyRunId(), "VERIFY_RUN_ID missing");
  setup.skip(!platformAccount(), "platform credentials missing");
  setup.skip(!tenantAOwner() || !tenantBOwner(), "VERIFY_A/B_OWNER credentials missing");

  const a = await provisionVerifyCompany("A");
  const b = await provisionVerifyCompany("B");

  const dir = resolve(
    process.cwd(),
    "verification/results",
    verifyRunId()!,
  );
  mkdirSync(dir, { recursive: true });
  const payload = {
    runId: verifyRunId(),
    ids: [
      {
        table: "companies",
        id: (a.result.data as { companyId?: string } | null)?.companyId ?? null,
        label: "A",
      },
      {
        table: "companies",
        id: (b.result.data as { companyId?: string } | null)?.companyId ?? null,
        label: "B",
      },
    ],
    errors: [
      a.result.error ? String(a.result.error) : null,
      b.result.error ? String(b.result.error) : null,
    ].filter(Boolean),
  };
  writeFileSync(
    resolve(dir, "database-after.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  if (a.result.error || b.result.error) {
    throw new Error(`provision failed: ${payload.errors.join("; ")}`);
  }
});
