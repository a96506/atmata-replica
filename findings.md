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
- **F-010 (residual, not fully Done):** CoA bilingual columns/migration may exist; data not backfilled — merged bilingual account name still visible (e.g. trial balance); UX incomplete.
- **F-025 (deferred):** ar/en key parity + nav i18n landed; many surfaces still EN — not Phase-5 reopen.
- **F-026 (deferred):** Scattered bdi/dir; systematic RTL isolation still open — not Phase-5 reopen.
- **F-062 (residual, partially fixed):** event_type / change_detail schema + HistoryTab render landed; field_change still not written from app paths — field-level audit incomplete in practice.
- `.vercel-token` in repo folder is invalid/placeholder — refresh for CLI env ops.

## Locked next
Prod promote when Ahmad asks; optional max-stock / further product polish is new scope.
