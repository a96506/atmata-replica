# ERP phase tracker

## Goal
Keep the locked InsForge ERP execution plan honest: Phases 0–6 marked
done, Phases 7–10 left not-started.

## Current Phase
Phase 7 transactional ERP writes — **complete**. Next = Phase 8 (not started).

## Phases

### Phase 0: Contract freeze
- [x] Shared contracts, specs, reviews, execution order, master locks
- **Status:** complete

### Phase 1: Demo identity
- [x] `scripts/bootstrap-demo-owner.mjs` bound `co_1` owner `361eb872-…`
- **Status:** complete on backend (script still uncommitted)

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
- **Status:** complete 2026-08-20 — DocEditShell/DocActionBar/Adoption = Phase 8

### Phase 8: Write UI and operational writes
- [ ] Doc shells + M17 recon/close/inbox; drop fake mutations
- **Status:** pending

### Phase 9: Scheduled operations
- [ ] `20260815164000` + `erp-scheduler` + seven crons
- **Status:** pending

### Phase 10: Release verification
- [ ] `scripts/verify/` isolation / no-mocks / P2P+Q2C gate
- **Status:** pending

## Hygiene leftover (not a phase reopen)
- Phase 1–3 tree still uncommitted
- Advisor stored scan dated 2026-08-09
- `APP_URL` still localhost
- Vercel preview `l9ejvc4lb` (SSO), not production
- dashboard/inbox/recon/settings still `DEMO_*` page mocks
- `alfailakawi1000@gmail.com` dual-hat — not isolation tenant B

## Errors Encountered
- Authenticated Playwright initially skipped: `DEMO_OWNER_PASSWORD` missing; workers also inherited a stale shell email. Fixed with `.env.local` override + e2e admin on `co_1`.
- Quote/RFQ send 409: shared identity trigger read `suggestion_id` on `email_log`. Invitation rotate blocked by immutable `token_hash`. Fixed in `20260815152300`.
- Playwright `next=/en/platform-admin` 404: next-intl doubled the locale. Strip `/en|/ar` in `safeNextPath`.
- `next build` interrupted by session-stop; not re-run.
- Phase 5 invite e2e: Turbopack CSS parse on `*:[svg:not([class*='size-'])]:size-*` (alert/alert-dialog) → `[&>svg:…]`. Also Next 16 blocks `127.0.0.1` vs `localhost` → `allowedDevOrigins`; login form `method="post"` so unhydrated fallback never GETs password.
