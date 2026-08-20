import { test } from "@playwright/test";
import {
  loadLocalEnv,
  mutationAllowed,
  tenantAOwner,
  verifyRunId,
} from "../fixtures/accounts";

loadLocalEnv();

test("real browser writes", async () => {
  test.skip(
    !mutationAllowed() || !tenantAOwner() || !verifyRunId(),
    "Requires VERIFY_ALLOW_MUTATION=erp-backend-v1 plus VERIFY_A_OWNER_* and VERIFY_RUN_ID",
  );
});
