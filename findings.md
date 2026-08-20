# ERP phase audit findings (2026-08-21 hygiene refresh)

## Current truth
- Linked backend: `erp-backend-v1` (`yfmw4i43-9rc`).
- Phase 0–10 complete on branch.
- Release run `vf_20260820_ac530f`: ordered gates passed.
- Hygiene Aug21: VERIFY_A/B tenants; DEMO overviews live; OCR approve/reject + `source_ocr_job_id`; FK indexes 139→0; verify seed + idempotency/optimistic-lock/storage pass; `resolveAppOrigin()` for Vercel; `npm run build` OK.

## Residual (not phase reopen)
- Large Phase 1–10 tree commit (in progress / pending Ahmad if commit deferred).
- Vercel **production** promote still manual (preview `l9ejvc4lb` SSO); local `NEXT_PUBLIC_APP_URL` stays localhost by design.
- Overview metrics deferred (no backend): demand forecast, vendor scores, price alerts, max stock.
- `.vercel-token` in repo folder is invalid/placeholder — refresh for CLI env ops.

## Locked next
Prod promote when Ahmad asks; optional forecast/score product work is new scope.
