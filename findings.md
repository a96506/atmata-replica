# ERP phase audit findings (2026-08-21 hygiene refresh)

## Current truth
- Linked backend: `erp-backend-v1` (`yfmw4i43-9rc`).
- Phase 0–10 complete on branch.
- Release run `vf_20260820_ac530f`: ordered gates passed.
- Hygiene Aug21: VERIFY_A/B tenants; DEMO overviews live; OCR approve/reject + `source_ocr_job_id`; FK indexes 139→0; verify seed + idempotency/optimistic-lock/storage pass; `resolveAppOrigin()` for Vercel; `npm run build` OK.

## Residual (not phase reopen)
- Large Phase 1–10 tree commit (in progress / pending Ahmad if commit deferred).
- Vercel **production** promote still manual (preview `l9ejvc4lb` SSO); local `NEXT_PUBLIC_APP_URL` stays localhost by design.
- **Wave 6 metrics — Done:** demand forecast, vendor scores, price alerts (SQL compute + tabs; not ML). Max stock / further product polish remains optional new scope.
- **F-010 (Done 2026-09-02):** CoA bilingual UI wired; Phase 6 verify Done. Safe data state verified 2026-09-02: `name_en` already backfilled from `name` (migration `20260827174453`; live DB 160/160 non-NULL). No trusted Arabic CoA seed in repo — `name_ar` stays NULL until human translation (do not invent/split). Residual seed/backfill closed.
- **F-025 (Phases 3–4 + Phase 6 verify Done 2026-09-02):** i18n wiring Done. Live `/ar` spot-check 2026-09-02 on `:3000`: NotificationsBell Arabic; inventory module list Arabic. **GlobalSearch:** live `/ar` spot-check **proved** 2026-09-02. **MasterCrud CoA residual cleared 2026-09-02:** `settings.coa` keys + `getTranslations` on `coa/page.tsx` (entity/title/columns/fields/types); MasterCrud chrome already used `masterCrud` keys. Typecheck pass. Live `/ar` re-spot-check optional.
- **F-026 (Phase 5 + Phase 6 verify Done 2026-09-02):** logical CSS Done. Live `/ar` spot-check 2026-09-02: `html[dir=rtl] lang=ar` on `/ar/settings/coa` + `/ar/inventory`; sidebar nav Arabic. CoA MasterCrud labels cleared under F-025 (2026-09-02); other master pages may still pass English props.
- **F-062 (writers + Phase 6 verify Done):** writers wired. **Live proof proved 2026-09-02** on local `:3000`: tax-code `EXEMPT` `name_en` `Tax exempt ·qa` → `Tax exempt ·f062`; `audit_events` `field_change` row id `3c2e374b-9a07-4871-90d0-1209b69539b7`. Unblocked by GRANT INSERT migration `migrations/20260902161444_audit-events-authenticated-insert.sql` (authenticated INSERT + RLS on `audit_events`).

- `.vercel-token` in repo folder is invalid/placeholder — refresh for CLI env ops.

## Locked next
Prod promote when Ahmad asks; optional max-stock / further product polish is new scope.
