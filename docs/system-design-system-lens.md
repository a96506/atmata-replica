# System lens re-score (Aug 31, 2026)

Re-score of audit §3 System components against the live stack after Phases 1–3.

Canonical design: [`docs/system-design.md`](system-design.md).
Plan: [`docs/system-design-adherence-plan.md`](system-design-adherence-plan.md).
Source audit: `docs/system-design-adherence-audit-aug30.pdf`.

Status legend: **PASS** = matches design; **PASS\*** = matches with explicit wording or intentional place split; **DEFER** = later, with a named trigger. No FAIL or UNKNOWN remains.

| Rule | Status | Note / trigger |
|------|--------|----------------|
| Monolithic one deploy unit | PASS\* | Next app is one Railway image (`Dockerfile` + `output: 'standalone'`). Schema migrations are a setup/maintenance step, not a runtime deploy unit. Edge function deploys removed (Phase 2). |
| Vertical scaling / one server | PASS | Railway: one replica, vertical autoscale. Verified Phase 1 (`railway.json`, live healthcheck). |
| SQL only for core data | PASS | InsForge PostgreSQL only. No Redis/Mongo in `package.json` or app data path. |
| No cache in front of DB | PASS | No Redis/Upstash. `react` `cache()` is request dedupe only (`getReadClient`). |
| One server topology | PASS\* | One Next replica on Railway. InsForge managed DB/auth/storage is the intentional place split (locked decision 3) — not a second app server. |
| One DB per company | PASS\* | Shared Postgres + `company_id` RLS (`my_company_id`) by design — not one Postgres instance per company. Do not reopen; data plan owns tenancy detail. |
| 1–30 users per company | PASS\* | Stated in design / locked decision 7; not enforced in schema or product code. Closes Aug30 UNKNOWN. |
| Write-heavy workload | PASS | Write path remains RPC/`callWriteRpc` + `write_commands`; lists no longer unbounded bulk-read (Phase 3). |
| Fast loading lists/forms | PASS\* | Heaviest lists server-paged (`listPage` + `serverPagination`). Remaining lists hard-capped at `ALL_PAGES_HARD_CAP` 1000. **Trigger:** move a remaining list to server paging when a tenant table exceeds 1000 rows. |
| Upload delay permitted | PASS | Browser → InsForge Storage; OCR/email/recon via async `jobs` queue. |
| Stateless server | PASS\* | Cookie/JWT session OK. In-memory rate-limit `Map` OK while one replica (locked decision 5). **DEFER trigger:** durable rate-limit store when a second replica is added. |
| Load-balancer friendly | DEFER | Auth is LB-ready; process-local throttle is not. **Trigger:** same as rate limit — durable store at second replica. |
| Cache friendly (later) | PASS | No sticky sessions for auth; `revalidatePath` after writes. Adding a cache layer stays out of scope until needed. |
| DB-replica friendly (later) | DEFER | Single write path via RPCs today; no read-replica routing in app. **Trigger:** add replica-aware reads when InsForge/ops introduce a read replica. |
| Latency path client→server→DB | PASS\* | App path is client → Railway Next → InsForge Postgres. Edge functions folded into the app. Storage remains client → InsForge (upload delay permitted). |
| Bandwidth awareness | PASS\* | Upload caps remain (e.g. 50 MB OCR upload). List bandwidth closed by server paging + 1000-row hard cap. **Trigger:** same list-cap trigger as fast loading. |
| Realtime | PASS | **Used** — jobs worker subscribes to InsForge realtime channel `jobs` / event `job_enqueued` (`src/lib/jobs/worker.ts`). Closes “realtime unused.” |

## Closed Aug30 FAIL / UNKNOWN / PARTIAL

| Aug30 status | Rule(s) | Resolution |
|--------------|---------|------------|
| FAIL | Vertical scaling; one server topology | Railway one replica + vertical scale; InsForge place split documented |
| UNKNOWN | 1–30 users | PASS\* stated, not enforced |
| PARTIAL | Deploy unit; write-heavy; lists; stateless; LB; DB-replica; latency; bandwidth | PASS / PASS\* / DEFER with triggers as above |

## Confirmation

Zero FAIL or UNKNOWN rows without a DEFER+trigger or PASS/PASS\*.
