# ERP session progress

## 2026-08-15
- Loaded Hermit global/project context and refreshed graph context.
- Read canonical plan, merge tracker, execution order, and master locks.
- Confirmed linked backend branch and existing uncommitted Phase 1 work.
- Recalled InsForge project memory; its Aug 9 status is stale versus current plan.
- Started exact Phase 2 contract/repository reconciliation.
- Four builders done: ActionResult/Zod/vitest (8 tests + typecheck), identity migration + platform bootstrap script, functions-support, read-contracts.
- Static recheck: typecheck + 8 tests pass. No backend apply yet — next is apply 150000→151000→152000 then platform-admin dry-run (needs PLATFORM_ADMIN_* env).

## 2026-08-16
- Hermit reload; resumed Phase 2 apply step on `erp-backend-v1` (`yfmw4i43-9rc`).
- Applied `20260815150000_identity-invitation-hardening.sql` (remote OK).
- Platform-admin dry-run passed; execution reported reused auth identity
  `alfailakawi1000@gmail.com`, inserted its `platform_admins` record, and
  created no company membership.
- Applied `20260815151000_functions-support.sql` and
  `20260815152000_read-contracts.sql` (remote OK).
- Verified all three Phase 2 migration versions remotely.
- Advisor command returned 0 critical, 0 warning, 0 info, but InsForge exposes
  only its latest stored scan; that scan is dated 2026-08-09 and therefore
  predates these migrations.
- Vitest: 3 files / 8 tests passed. TypeScript typecheck passed.
- Production build passed: Next.js compiled, typechecked, and generated all
  139 static pages successfully.
- Bootstrap idempotency dry-run confirmed the auth user and platform-admin
  record already exist, with no company membership.
- Phase 2 complete. Stop before Phase 3.

## 2026-08-17
- Phase 3 on `erp-backend-v1` (`yfmw4i43-9rc`).
- Applied `20260815152100_ai-persistence-rpcs.sql` (persist/dismiss AI + reconciliation suggestion RPCs). Did not rewrite 151000.
- Deployed active: `pdf-gen`, `email-send`, `ocr-vendor-bill`, `reconciliation-suggest`, `ai-assistant`.
- Reads: `src/lib/api` seed imports removed; shared `src/lib/db/read.ts` + `selects.ts`; search/adoption client-safe routes.
- Vitest 7 files / 18 tests passed. Typecheck passed. Advisor stored scan 0 findings (dated 2026-08-09, stale).
- First pass: Playwright skipped (`DEMO_OWNER_PASSWORD`); quote/RFQ email + invitation rotate blocked. **Superseded by follow-up below** (15/15 + `152300`).
- Phase 3 complete. Stop before Phase 4.

## 2026-08-17 follow-up
- Playwright 15/15 functions e2e passed after `.env.local` override, e2e admin on `co_1`, and `20260815152300_email-claim-and-invitation-rotate.sql`.
- Vitest 18/18, typecheck, and local `next build` passed.
- Preview deploy (not production): https://atmata-replica-frontend-l9ejvc4lb.vercel.app
- On request, bound `alfailakawi1000@gmail.com` to `co_1` as a non-owner admin so it can sign in to the tenant app. It remains the platform admin; owner separation still holds (`is_owner = false`).
- Stop before Phase 4.

## 2026-08-18
- Hermit load + phase audit. Stale trackers said Playwright skipped / next Phase 3 / Phase 2 not started / seed membership empty.
- Marked Phase 0–3 complete in canonical plan, execution-order, merge tracker, README, functions.md, reads.md, workspace `task_plan.md`.
- Phases 4–10 explicitly **not started**. Hardening walkthrough plan marked SUPERSEDED.
- Did not start Phase 4.

## 2026-08-18 Phase 4
- Ahmad started Phase 4. Linked backend `erp-backend-v1` (`yfmw4i43-9rc`).
- Applied `20260815153000_platform-admin.sql`. Redeployed `email-send` (invitationToken path).
- UI: `src/features/platform-admin` + `/[locale]/(platform)/platform-admin`. Shared ActionResult reused.
- Vitest 26/26 (incl. live RLS + provisioning). Playwright platform-admin e2e 3/3.
- `next build` interrupted at session stop. Stop before Phase 5.

## 2026-08-20 Phase 6
- Hermit load; Phase 5 done → Phase 6 M13 write command foundation.
- Applied `20260815155000_write-command-foundation.sql` on `erp-backend-v1`.
- Ledger `write_commands` + manifest; claim/complete helpers; `WRITE:` errors; capability roles; approval vs immediate-post matrix; `reverse_document` counter JE/stock; period-close ensure helpers; revoke document DML.
- Hardened public RPCs: `transition_document` / `post_document` / `create_approval_request` / `resolve_approval_request` / new `reverse_document` — all require `expected_row_version` + `idempotency_key`; dropped trustable `p_active_role`.
- App: `src/lib/actions/validation/common.ts` + `parseWriteRpcError` in `errors.ts`. Vitest 13 pass (write schemas + prior action tests).
- Verified remote: write_commands exists, po INSERT revoked, draft→post rows for 5 immediate-post types.
- No production forms wired. Stop before Phase 7.

## 2026-08-20 Phase 7
- Hermit load; Phase 6 done → Phase 7 M14→M16 transactional writes.
- Applied `20260815160000` P2P, `61000` Q2C, `62000` inv/GL on `erp-backend-v1`.
- Follow-ups: `62100` Q2C `line_order` on inserts; `62200` EXECUTE/FOUND fix (`apply_create_intent` / approval-core / `update_document_header`).
- App: domain Zod + Server Actions + `write-rpc.ts`; 13 `/new` forms off demo toasts; FATOORA branches removed from invoice form.
- Vitest 56/56; live `writes-create.insforge.test.ts` 2/2 (PO idempotency + JE draft).
- Stop before Phase 8 (DocEditShell / DocActionBar / AdoptionNewShell / M17).

## 2026-08-20 Phase 8
- Hermit load; Phase 7 done → Phase 8 Doc shells + M17.
- Applied `20260815163000_operational-write-rpcs.sql` on `erp-backend-v1` (14 ops RPCs + DML revoke).
- DocEditShell / DocActionBar: real update/transition/post/reverse/approval dispatch; 24 pages plumbed with docId+rowVersion.
- AdoptionNewShell → create_rfq / create_vendor_return / create_customer_return.
- Ops: reconciliation + period-close + fiscal + inbox actions; live reads for inbox/recon/close.
- Vitest 58+; tsc clean. OCR invoice demo + full fake teardown deferred (functions/AI).
- Stop before Phase 9 schedules.

## 2026-08-20 Phase 9
- Hermit load; Phase 8 done → Phase 9 schedules.
- Applied `20260815164000_scheduled-operations.sql` on `erp-backend-v1`.
- Deployed `erp-scheduler`; added `SCHEDULE_CRON_TOKEN`; seven GMT crons created inactive, verified, then activated.
- Manual jobs: aging idempotent skip; stale/month_end/inventory/depreciation succeeded; fx_ingest failed (no `FX_RATES_API_KEY`).
- Vitest schedule unit 7 + live RPC 3; tsc clean.
- Stop before Phase 10.

## 2026-08-20 Phase 10
- Hermit load; Phase 9 done → Phase 10 verify.
- Built `scripts/verify/*` + `tests/verification/*` + `verification/{README,waivers,.gitignore}`.
- Cleared no-mocks: deleted fakeService; settings/COA/FX/approvals + NotificationsBell on InsForge; browser scratch via `src/lib/browser-store.ts`.
- Applied `20260820210445_doc-state-transitions-rls.sql`; advisor suppress DEFINER + shared-ref permissive; rescan critical=0.
- Fetch-based Playwright fixture (SDK import breaks Node via shared-schemas).
- Clean run `vf_20260820_ac530f` — all gates pass. Isolation/P2P skip without VERIFY_A/B_*.
