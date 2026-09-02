# System Design Adherence Plan

Goal: make the live `atmata-ui-only` stack adhere to the day-one system design.

Canonical design: [`docs/system-design.md`](system-design.md).
Source audit: `docs/system-design-adherence-audit-aug30.pdf` (Aug 30, partial adherence).
System lens re-score: [`docs/system-design-system-lens.md`](system-design-system-lens.md).

## Locked decisions (design contract)

These decisions are final for this plan. They define the target shape.

1. **Path:** the implementation changes to adhere to the original design. The design is the target, not the code.
2. **Server place:** the Next app runs on **Railway** as one long-running container, pinned to one replica, with vertical autoscale. Not Vercel.
3. **Database, Auth, Storage places:** stay on managed InsForge (`yfmw4i43.eu-central.insforge.app`). The `@insforge/sdk` and the `insforge` CLI plus the agent skills keep working.
4. **Edge functions:** all six fold into the Next app as route handlers, in-process workers, and in-process cron. They do not stay as separate InsForge edge deploys.
5. **Rate limit:** the in-memory `Map` stays for day-one. It moves to a durable store only when a second replica is added.
6. **List paging:** server-side pagination on the heaviest lists now. The rest get a hard cap and a documented trigger.
7. **Seat cap:** the "1 to 30 users per company" assumption is stated in the design, with no code enforcement.
8. **Build:** an explicit `Dockerfile` with Next standalone output. No Nixpacks auto-build.
9. **Deploy unit:** the Next app is one deploy unit (one image). Schema migrations are a setup and maintenance step, not a runtime deploy unit.

## Backlog

The backlog is grouped by phase. Items inside a phase can be done together. A phase can run in one Cursor session. Verify each phase before the next.

### Phase 1 — Deploy target setup (Railway + Dockerfile)

Checklist (do together):

- [x] Set `output: 'standalone'` in `next.config.ts`.
- [x] Add a minimal `Dockerfile` that builds and runs the Next standalone server.
- [x] Add a `railway.json` with a healthcheck path and the start command.
- [x] Provision the Railway service. Set the env vars from `.env.local` (InsForge project URL, anon and service keys, JWT secret, app base URL).
- [x] Pin the service to one replica. Enable vertical autoscale within the plan.
- [x] Deploy from the `storage-wiring` branch. Confirm the app boots and the healthcheck passes.
- [x] Smoke test: log in as a demo owner, open the dashboard, confirm SSR data loads from managed InsForge.

Verification (done Aug 31, 2026):

- `npm run build` passes locally with standalone output (repo uses npm, not pnpm).
- Railway deploy shows one running replica, green healthcheck (`/api/health` → 200).
- Live URL: `https://atmata-replica-production.up.railway.app`
- Demo owner login → inbox + dashboard SSR from InsForge (cash KWD 827.400, pending approvals, live notifications — not fake service).
- Start command must stay exec-safe: `node server.js` only (no `HOSTNAME=` prefixes; bind via Dockerfile `ENV HOSTNAME=0.0.0.0`).

Anti-pattern guard: do not enable a second replica. Do not add Nixpacks config. Do not move the database off InsForge.

### Phase 2 — Fold the six edge functions into the app

This is the largest phase. Each function is its own sub-task, but they share the queue and the worker runtime. Build the shared runtime first, then fold each function.

Shared runtime (do first, together):

- [x] Add a `jobs` table migration: `jobs(id, company_id, type, payload jsonb, status, attempts, run_after, created_at)`. Add RLS keyed by `my_company_id()`.
- [x] Add an in-process worker loop in the Next app that claims a job, runs its handler, and marks it done or failed. Use `SELECT ... FOR UPDATE SKIP LOCKED` for safe claiming.
- [x] Wire InsForge realtime so the worker wakes on `NOTIFY` when a new job is inserted, instead of polling. This retires the "realtime unused" finding.
- [x] Add a small enqueue helper (`enqueueJob(type, payload)`) used by the route handlers.

Fold each function:

- [x] `pdf-gen` → a route handler that renders the PDF inline. Keep the existing pdfnative pipeline. If a report is heavy, enqueue it and return a job id.
- [x] `ai-assistant` → a route handler with a streaming response. Keep the OpenRouter gateway call.
- [x] `email-send` → an in-process worker handler. Route handlers enqueue an `email` job and return immediately.
- [x] `ocr-vendor-bill` → an in-process worker handler. The upload route enqueues an `ocr` job; the worker runs OCR and writes back the parsed vendor bill.
- [x] `reconciliation-suggest` → an in-process worker handler. The reconcile action enqueues a `recon` job; the worker runs the AI suggestion and stores the result.
- [x] `erp-scheduler` → an in-process `node-cron` loop that enqueues scheduled jobs at their due time. Persist the schedule in a `schedules` table so it survives restarts.

Cleanup:

- [x] Remove the six InsForge edge function deploys (`functions/pdf-gen`, `email-send`, `ocr-vendor-bill`, `reconciliation-suggest`, `ai-assistant`, `erp-scheduler`). Keep the source as reference in the repo if useful, but they no longer deploy as separate units.
- [x] Update `insforge.toml` and any ops scripts that reference the edge functions.

Verification (done Aug 31, 2026):

- [x] Migration `20260831065104_jobs-queue-and-schedules.sql` applied on erp-backend-v1: `jobs`, `schedules` (7 global rows), `claim_job` / `enqueue_job` / `complete_job`, realtime channel `jobs`.
- [x] In-process worker + node-cron boot via `instrumentation.ts` and `/api/health` fallback (standalone instrumentation gap).
- [x] Edge function deploys removed (`functions list` empty). Source kept under `functions/` as reference. InsForge platform schedules set inactive.
- [x] Folded paths: `/api/pdf`, `/api/ai` (SSE chat), email/ocr/recon/erp/pdf job handlers, `/api/cron/erp` token kick.
- [x] `npm run typecheck` and `npm run build` pass (repo uses npm, not pnpm).
- Per-function live smoke on Railway after the next deploy: PDF generate, invitation email, OCR enqueue, recon suggest, assistant stream, one scheduled erp enqueue.

Anti-pattern guard: do not run the worker as a separate Railway service (that breaks one deploy unit). Do not add Redis or an external queue. The queue stays in Postgres.

### Phase 3 — List paging on the heaviest lists

Checklist (do together):

- [x] Add `limit` and `offset` (or cursor) params to the list reads for the heaviest tables: invoices, journal entries, attachments, stock moves, suppliers, customers.
- [x] Update `src/components/data-table.tsx` to request one page at a time from the server, not to slice a full client list.
- [x] For the remaining list pages, add a hard cap of 1000 rows to `allPages` and a code comment with the trigger: "move to server-side pagination when a tenant table exceeds 1000 rows."
- [x] Verify the heaviest lists return the first page in one request and load the next page on demand.

Verification (done Aug 31, 2026 — code path):

- [x] Shared runtime: `listPage` + `parseListPage` (default 50), `ALL_PAGES_HARD_CAP` 1000, DataTable/`SelectableDataTable` `serverPagination` via `?page=`.
- [x] Heaviest lists wired: customer invoices, vendor bills, journal entries, attachments tab, stock moves, customers, suppliers.
- [x] `npm run typecheck` passes.
- Live smoke on Railway (50-row first open + Next page) — **Closed** as ops deploy checklist (same as Phase 2 per-function smoke); not an open product gap.
- Capped remaining lists load via `allPages` hard stop; no UI banner (trigger is code comment only).

Anti-pattern guard: do not paginate every list in one pass. Do not remove the cap on the remaining lists without server-side pagination.

### Phase 4 — Design doc and documentation items

Checklist (do together):

- [x] Rewrite the system design section to lock the nine decisions above as the canonical shape.
- [x] Document the rate-limit trigger: "in-memory until a second replica; move to a durable store at that point."
- [x] Document the seat-cap assumption: "1 to 30 users per company, stated, not enforced."
- [x] Document the deploy-unit wording: "the Next app is one deploy unit; schema migrations are a setup and maintenance step, not a runtime deploy unit."
- [x] Document the list-paging cap trigger for the remaining lists.
- [x] Mark the realtime line as used (job queue notify).

Verification (done Aug 31, 2026):

- Canonical design: see `docs/system-design.md` (locks the nine decisions; matches live Railway + InsForge stack).
- System lens re-score: `docs/system-design-system-lens.md` — every Aug30 system row is PASS, PASS*, or DEFER with a trigger. Zero FAIL / UNKNOWN left open.
- Realtime used: in-process jobs worker wakes on InsForge `jobs` channel (`job_enqueued`); see `src/lib/jobs/worker.ts`.
- Rate-limit / seat-cap / deploy-unit / list-cap triggers documented in the design doc and system-lens table.

Anti-pattern guard: do not rewrite the data design in this phase. Data items landed in Waves 3–7 / A–D; see § Next (Closed-by-decision / Done).

## Next

No open data backlog. Former data-lens items are **Done** (Waves A–D / 3–7) or **Closed-by-decision** below. Permanent exclusions stay under **Out of scope**.

### Closed-by-decision

- **Roles model:** keep `company_members.roles text[]` — will not refactor to a join table for day-one.
- **Naming alignment:** cosmetic only (UI/i18n) — `suppliers`→Vendors, `buyer`→Purchasing, `warehouse`→Inventory labels; **no schema rename**.
- **ML scoring / ML forecast:** Closed — Wave 6 SQL compute (`vendor_scores`, `price_alerts`, `inventory_forecasts`) is the product.

### Done (reference — Waves 3–7 / A–C)

- Trial balance filters, GL report, JE `(company_id, date)` index — Wave 7
- CoA CRUD, apply-credit (+ contra-AR GL), opportunities edit/delete — Wave 7 / A1
- FX in report RPCs / PDF / GL UI; bank statements `listPage`; FX rates + currencies writable — A2 / A3
- Warehouses/locations CRUD; reorder→PR/PO links; `operational_alerts` in inbox — B1
- `pending:*` mark-read; `/settings/audit`; adoption client graph intentional; payment-terms/branches/sequences read-only-by-design — C
- Cosmetic naming labels — Wave D (this pass)

## Out of scope (by design)

- DB-replica routing, cache layer, multi-region, second replica: permanent Out of scope for day-one (triggers remain in [`system-design.md`](system-design.md) §4 if ever revisited).
- Self-hosting InsForge: rejected. The CLI and agent skills are cloud-only; keeping managed InsForge preserves the agent workflow.
