# ERP phase audit findings (2026-08-20 Phase 7)

## Current truth
- Linked backend: `erp-backend-v1` (`yfmw4i43-9rc`).
- Phase 0–7 complete on that branch. Phase 8–10 not started.
- Applied through `20260815162200_fix-execute-found-checks.sql`.
- Create RPCs live for P2P + Q2C + JE/transfer/adjustment; `update_document_header` + `award_rfq`.
- 13 dedicated `/new` forms call Server Actions (stable idempotency keys).
- Pitfall: plpgsql `EXECUTE … INTO` does **not** set `FOUND` — never use `IF NOT FOUND` after EXECUTE; check assigned columns / `GET DIAGNOSTICS`.
- Live smoke: PO draft idempotent + JE balanced draft (DEMO_OWNER).
- DocEditShell / DocActionBar / AdoptionNewShell / RFQ+returns pages / M17 still Phase 8.

## Leftover, not a phase reopen
- Uncommitted Phase 1–7 working tree
- Advisor stored scan may lag; use `advisor scan` when checking
- `APP_URL` still localhost
- Vercel preview only
- Page mocks: dashboard / financials / inbox / recon / close / settings overviews
- Dual-hat `alfailakawi1000@gmail.com` — not isolation tenant B

## Locked next
Phase 8: DocEditShell + DocActionBar + AdoptionNewShell + M17 ops. Wait for Ahmad / next session.
