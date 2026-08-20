# ERP phase tracker

## Goal
Keep the locked InsForge ERP execution plan honest: Phases 0–10 marked
done. Canonical Cursor plans synced Aug20.

## Current Phase
Phase 10 release verification — **complete** (`vf_20260820_ac530f`).
Hygiene: VERIFY_A/B tenants provisioned (`scripts/bootstrap-verify-tenants.mjs`); curated master data seeded (`scripts/seed-verify-master-data.mjs`); isolation + role-denial + idempotency + optimistic-lock + storage-isolation + curated P2P create chain unlocked.

## Phases

### Phase 0: Contract freeze
- [x] Shared contracts, specs, reviews, execution order, master locks
- **Status:** complete

### Phase 1: Demo identity
- [x] `scripts/bootstrap-demo-owner.mjs` bound `co_1` owner `361eb872-…`
- **Status:** complete on backend

### Phase 2: Shared foundations
- [x] ActionResult / Zod / vitest
- [x] `20260815150000` identity-invitation-hardening
- [x] `bootstrap-platform-admin.mjs` (`alfailakawi1000@gmail.com`)
- [x] `20260815151000` functions-support
- [x] `20260815152000` read-contracts
- **Status:** complete 2026-08-16 on `erp-backend-v1`

### Phase 3: Functions core and real reads
- [x] Deploy `pdf-gen`, `email-send`, `ocr-vendor-bill`, `reconciliation-suggest`, `ai-assistant`
- [x] Add-ons `152100` / `152200` / `152300`
- [x] Rewire 13 `src/lib/api` modules off seed
- [x] Playwright functions e2e 15/15
- **Status:** complete 2026-08-17

### Phase 4: Platform administration
- [x] `20260815153000_platform-admin.sql` applied on `erp-backend-v1`
- [x] `/[locale]/(platform)/platform-admin`
- [x] `src/features/platform-admin` + PlatformShell
- [x] Provision / suspend / counts / audit RPCs
- [x] Vitest 26/26; Playwright platform-admin e2e 3/3
- **Status:** complete 2026-08-18 (`next build` interrupted at session stop)

### Phase 5: Company user administration
- [x] `20260815154000_user-admin-hardening.sql` applied
- [x] `src/features/user-admin` + `settings/users`
- [x] Invite / roles / deactivate actions
- [x] Invitation accept uses server-derived email
- [x] Playwright user-admin e2e 3/3 (CSS `*:[svg:not…]` fix + `allowedDevOrigins`)
- **Status:** complete 2026-08-20

### Phase 6: Write command foundation
- [x] `20260815155000_write-command-foundation.sql` applied on `erp-backend-v1`
- [x] `write_commands` ledger + company_table_manifest
- [x] Idempotency + `expected_row_version` on transition/post/approve/resolve/reverse
- [x] Server-derived roles (no `p_active_role`); `WRITE:` SQLSTATE convention
- [x] Approval vs immediate-post matrix; `reverse_document` counter JE/stock
- [x] Period-close helpers `ensure_period_close_run` / `ensure_period_close_tasks`
- [x] Revoke document header/line DML from authenticated
- [x] Shared Zod write schemas + `parseWriteRpcError`; vitest 13 pass
- **Status:** complete 2026-08-20 — no production forms wired (Phase 7+)

### Phase 7: Transactional ERP writes
- [x] M14 P2P (`20260815160000`) + FOUND fix (`62200`)
- [x] M15 Q2C (`20260815161000`) + line_order fix (`62100`)
- [x] M16 inv/GL (`20260815162000`)
- [x] Zod + Server Actions (`p2p`/`q2c`/`inventory`/`gl`/`documents`)
- [x] 13 dedicated `/new` forms wired; live create smoke 2/2
- **Status:** complete 2026-08-20

### Phase 8: Write UI and operational writes
- [x] `20260815163000_operational-write-rpcs.sql` (M17) applied on `erp-backend-v1`
- [x] DocEditShell / DocActionBar wired (12 edit + 12 detail); no demoConflict / ephemeral state
- [x] AdoptionNewShell → create_rfq / vendor_return / customer_return
- [x] Recon import/rules/accept/skip/complete; fiscal close; period-close; inbox mark-read
- [x] Live inbox/recon/close reads (off DEMO_* for those surfaces)
- [x] Vitest 58+ (incl. M17 schema checks); tsc clean
- [x] OCR invoice detail live read + approve/reject Server Actions (off DEMO_INVOICE_DETAIL)
- **Status:** complete 2026-08-20 — full `_client`/DemoModeBanner teardown waits AI

### Phase 9: Scheduled operations
- [x] `20260815164000` + `erp-scheduler` + seven crons
- **Status:** complete 2026-08-20 on `erp-backend-v1`

### Phase 10: Release verification
- [x] `scripts/verify/` harness + `tests/verification/` manifests/fixtures/setup/static/api/browser
- [x] Clean gate run `vf_20260820_ac530f` — all ordered gates pass
- [x] no-mocks cleared; advisor criticals suppressed (DEFINER accepted_risk + shared-ref RLS)
- [x] Migration `20260820210445_doc-state-transitions-rls.sql` applied
- **Status:** complete 2026-08-20 — VERIFY_A/B tenants provisioned; isolation/role-denial unlocked

## Hygiene leftover (not a phase reopen)
- ~~Phase 1–8 tree still uncommitted~~ → committed with Phase 8–10 + Aug21 hygiene (this commit)
- ~~`APP_URL` still localhost~~ → `resolveAppOrigin()` (`src/lib/app-url.ts`) ignores localhost on Vercel and uses `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` ([Vercel system env](https://vercel.com/docs/environment-variables/system-environment-variables)); local `.env.local` stays localhost
- `FX_RATES_API_KEY` set Aug20 — fx_ingest verified (CBK `value` field parser fix)
- Vercel preview `l9ejvc4lb` (SSO), not production — prod promote still manual (`vercel --prod` / merge to production branch)
- ~~dashboard / financials / module overview pages still `DEMO_*` page mocks~~ — Hygiene 4: live InsForge reads (reports + list aggregates)
- Overview metric gap audit (Hygiene leftover fill):
  - **Wired:** dashboard AI `success_rate` ← `ai_queued_actions` (executed/(executed+failed)); omit when no terminal rows
  - **No backend — deferred:** inventory demand forecast (no forecast table/RPC)
  - **No backend — deferred:** purchasing price alerts (no price_alerts table/RPC; `price_list_items` is static)
  - **No backend — deferred:** purchasing vendor scores (suppliers have no score/rating columns)
  - **No backend — deferred:** inventory max stock (`products.reorder_point` only; no `max_stock` column)
- ~~OCR invoice detail live: approve → `create_vendor_bill` + `matched_doc_id`; reject → job `failed`/`REJECTED`. Gap: `vendor_bills.source_ocr_job_id` not set by create RPC yet~~ → `20260820213307_vendor-bill-source-ocr-job` adds `p_source_ocr_job_id`; `approveOcrJobAction` passes job id
- ~~`alfailakawi1000@gmail.com` dual-hat — not isolation tenant B~~ → Tenant B is `verify.b.owner@atmata.example` on `85511332-…` (never dual-hat); platform dual-hat remains co_1-only
- ~~Full tenant A/B isolation + P2P/Q2C posting gate awaits `VERIFY_A_*` / `VERIFY_B_*`~~ → `bootstrap-verify-tenants.mjs` + `seed:verify-master-data` (supplier/product/PO; accounts/warehouse/terms from `seed_company_defaults`); `table-isolation` / `role-denial` / `search-isolation` / `idempotency` / `optimistic-lock` / `storage-isolation` / curated P2P PR→PO→GRN pass. Full bill/post matrix still manual. Migrations `20260820213919` (EXECUTE FOUND) + `20260820214243` (STALE over HTTP uses P0001) on erp-backend-v1.
- Performance advisor FK indexes: cleared (`missing-fk-index` 139→0) via `20260820212431_fk-covering-indexes.sql` + `20260820212705_email-log-requested-by-fk-index.sql` on erp-backend-v1 (139 covering indexes; plain CREATE INDEX — migrations wrap in a transaction so CONCURRENTLY is ops-only; force refresh with `npx @insforge/cli advisor scan`)

## Errors Encountered
- Authenticated Playwright initially skipped: `DEMO_OWNER_PASSWORD` missing; workers also inherited a stale shell email. Fixed with `.env.local` override + e2e admin on `co_1`.
- Quote/RFQ send 409: shared identity trigger read `suggestion_id` on `email_log`. Invitation rotate blocked by immutable `token_hash`. Fixed in `20260815152300`.
- Playwright `next=/en/platform-admin` 404: next-intl doubled the locale. Strip `/en|/ar` in `safeNextPath`.
- ~~`next build` interrupted by session-stop; not re-run.~~ → `npm run build` OK 2026-08-21
- Phase 5 invite e2e: Turbopack CSS parse on `*:[svg:not([class*='size-'])]:size-*` (alert/alert-dialog) → `[&>svg:…]`. Also Next 16 blocks `127.0.0.1` vs `localhost` → `allowedDevOrigins`; login form `method="post"` so unhydrated fallback never GETs password.
