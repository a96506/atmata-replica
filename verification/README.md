# Release verification harness

Targets InsForge backend branch **erp-backend-v1** (`yfmw4i43-9rc`). Never run mutation mode against production.

## Required environment

| Variable | Purpose |
| --- | --- |
| `VERIFY_RUN_ID` | `vf_YYYYMMDD_xxxxxx` (e.g. `vf_$(date -u +%Y%m%d)_$(openssl rand -hex 3)`) |
| `VERIFY_ALLOW_MUTATION` | Must be `erp-backend-v1` to create fixtures / run mutating Playwright |
| `VERIFY_BASE_URL` | App URL (localhost or preview). Production URLs are blocked. |
| `VERIFY_PLATFORM_EMAIL` / `VERIFY_PLATFORM_PASSWORD` | Platform admin (falls back to `PLATFORM_ADMIN_*`) |
| `VERIFY_A_OWNER_EMAIL` / `VERIFY_A_OWNER_PASSWORD` | Tenant A owner |
| `VERIFY_A_VIEWER_EMAIL` / `VERIFY_A_VIEWER_PASSWORD` | Tenant A viewer |
| `VERIFY_B_OWNER_EMAIL` / `VERIFY_B_OWNER_PASSWORD` | Tenant B owner |
| `INSFORGE_URL` / `NEXT_PUBLIC_INSFORGE_ANON_KEY` | Backend URL + anon key |
| `VERIFY_START_SERVER=1` | Optional: let Playwright start `next start` |

Never commit passwords or API keys. Scripts redact secrets in evidence output.

## Bootstrap VERIFY tenants

Creates two separate companies (A + B) via `platform_provision_company`, accepts owner invitations, and invites a viewer on A. Does **not** mutate `co_1`. Tenant B must never be the platform dual-hat.

```bash
npm run bootstrap:verify-tenants
# writes VERIFY_* (+ VERIFY_ALLOW_MUTATION / VERIFY_RUN_ID) into .env.local

npm run seed:verify-master-data
# supplier + product + draft PO on VERIFY A/B (uses seed_company_defaults warehouse/terms/tax/accounts)
# writes verification/results/$VERIFY_RUN_ID/verify-seed-state.json (no secrets)
```

Multi-tenant Playwright pattern: dedicated credentials per tenant + `storageState` per role (see `tests/verification/setup/accounts.setup.ts`). Negative cross-tenant asserts live in `tests/verification/api/*-isolation.spec.ts`. Storage keys must be `${companyId}/…` under private buckets `documents` / `imports`.

## Commands

```bash
export VERIFY_RUN_ID="vf_$(date -u +%Y%m%d)_$(openssl rand -hex 3)"
export VERIFY_ALLOW_MUTATION="erp-backend-v1"
export VERIFY_BASE_URL="http://127.0.0.1:3000"

npm run verify:guard
npm run verify:advisor
npm run verify:static
npm run verify          # full ordered gates + cleanup + report
```

Evidence lands in `verification/results/$VERIFY_RUN_ID/` (`report.json`, `report.md`, `sha256sums.txt`).

## Safety

- Branch guard asserts active project `erp-backend-v1` / appkey `yfmw4i43-9rc`.
- Mutation fixtures must include `VERIFY_RUN_ID`; do not mutate `co_1`.
- Cleanup only acts on IDs recorded in `database-after.json` for the run.
