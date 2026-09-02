# System design (canonical)

This document is the day-one **system** design for `atmata-ui-only`.
It locks the nine decisions in `docs/system-design-adherence-plan.md`.
Implementation must adhere to this design. The design is the target, not the code.

Source plan: `docs/system-design-adherence-plan.md`.
Prior audit (Aug 30, partial adherence): `docs/system-design-adherence-audit-aug30.pdf`.

This document does **not** redesign the data layer (tables, TB/GL, roles, naming).
Former data-lens items are **Done** or **Closed-by-decision** in [`system-design-adherence-plan.md`](system-design-adherence-plan.md) § Next. Permanent exclusions stay in §4 / Out of scope.

---

## 1. Intent

We ship one Next.js application.
The app uses managed InsForge for SQL and file storage.

Each company has few users and many writes.
List screens must load fast.
Upload work can finish after the user leaves the page.

The server holds no session state beyond the JWT or cookie that the client sends.
Auth is stateless from day one.

Later we can add a load balancer, a cache, and database replicas without a redesign.
The trigger table in this document states when each Out-of-scope “later” item would start (if ever revisited).
Do not implement those items before their trigger.

---

## 2. Four places (live stack)

The system has four places.

### Client

The browser runs Next.js 16, React 19, Tailwind 4, and next-intl.
The browser talks to InsForge with `@insforge/sdk`.

### Server

The Next app runs on **Railway** as one long-running container.
The image comes from an explicit `Dockerfile` with Next `output: 'standalone'`.
The service stays at **one replica**.
Railway vertical autoscaling grows CPU and memory within the plan limits ([Railway scaling docs](https://docs.railway.com/deployments/scaling)).
This is not a Vercel deploy.

Evidence: `railway.json` (`builder: DOCKERFILE`, `node server.js`, `/api/health`), `Dockerfile`, `next.config.ts` (`output: "standalone"`).

### Database

SQL lives on managed InsForge Postgres at `yfmw4i43.eu-central.insforge.app` (project `erp-backend-v1`).
Companies share one database.
Row isolation uses `company_id` and RLS (`my_company_id()`).

### Storage

Files live in InsForge buckets `documents` and `imports`.
The database stores attachment keys and URLs only.

---

## 3. Locked decisions

These nine decisions are final. They define the target shape.

### 3.1 Path — design is the target

The implementation changes to match this design.
When code and design disagree, change the code.
Do not rewrite this design to match a temporary stack.

### 3.2 Server place — Railway, one container, one replica

The Next app runs on Railway as one long-running container.
Replicas stay at one.
Scale vertically with Railway plan limits before you add a second replica.
Do not deploy this app to Vercel.
Agents: use Railway MCP (`plugin-railway-railway`) only for this app — not the Vercel CLI, plugin, or MCP.

### 3.3 Database, Auth, Storage — managed InsForge

Database, Auth, and Storage stay on managed InsForge.
The `@insforge/sdk`, the `insforge` CLI, and the agent skills keep working against the cloud project.
Self-host InsForge is rejected (see Out of scope).

### 3.4 Edge functions — folded into Next

The six former InsForge edge functions fold into the Next app:

| Former slug | In-app home |
|-------------|-------------|
| `pdf-gen` | Route handler `/api/pdf` |
| `ai-assistant` | Route handler `/api/ai` (stream) |
| `email-send` | In-process job handler |
| `ocr-vendor-bill` | In-process job handler |
| `reconciliation-suggest` | In-process job handler |
| `erp-scheduler` | In-process `node-cron` plus `/api/cron/erp` |

Background work uses a Postgres `jobs` table as the queue.
An in-process worker claims jobs with `claim_job` (`FOR UPDATE SKIP LOCKED`).
InsForge realtime wakes the worker on channel `jobs` with event `job_enqueued` (Postgres `NOTIFY`).
An ~8 second poll is the fallback if realtime drops.
**Realtime is used** for the job queue.

Reference source under `functions/` is not deployed.
Do not run a separate Railway worker service.

### 3.5 Rate limit — in-memory until a second replica

Day-one rate limit uses an in-memory `Map` in `src/lib/actions/rate-limit.ts`.
That store is correct only while one replica runs.

**Trigger wording (exact):** in-memory until a second replica; move to a durable store at that point.

### 3.6 List paging — server-side heaviest lists, hard cap elsewhere

The heaviest lists use server-side pagination (`limit` / `offset` or page params):
customer invoices, vendor bills, journal entries, attachments, stock moves, customers, suppliers.

Other lists use `allPages` with hard cap `ALL_PAGES_HARD_CAP = 1000` in `src/lib/db/read.ts`.

**Trigger wording (exact):** move to server-side pagination when a tenant table exceeds 1000 rows.

### 3.7 Seat cap — stated, not enforced

**Assumption wording (exact):** 1 to 30 users per company, stated, not enforced.

No schema constraint and no product gate enforce this seat cap.
The number guides capacity and UX assumptions only.

### 3.8 Build — Dockerfile + standalone, no Nixpacks

Build uses an explicit `Dockerfile`.
Next config sets `output: 'standalone'`.
`railway.json` sets `builder: DOCKERFILE`.
Do not use Nixpacks auto-build for this service.

### 3.9 Deploy unit — Next app only at runtime

**Deploy-unit wording (exact):** the Next app is one deploy unit; schema migrations are a setup and maintenance step, not a runtime deploy unit.

One Railway image deploys the app, the in-process worker, and cron.
SQL migrations under `migrations/` run as ops setup, not as part of container start.

---

## 4. Explicit trigger table (Out of scope “later”)

| Out-of-scope item | Day-one state | Trigger to start work |
|---------------|---------------|------------------------|
| Second replica / durable rate limit | One Railway replica. In-memory `Map` rate limit. | When you add a second replica: move rate limit to a durable store at that point. Keep one deploy unit (do not split a worker service). |
| Cache layer | No Redis / Upstash in front of the DB | When read latency or DB load stays high after list paging and indexes. Auth stays cookie/JWT (no sticky sessions). |
| DB-replica routing | Single write path via RPCs. No replica routing in app. | When a managed read replica exists and write traffic needs isolation from heavy reads. Route reads only. Keep writes on the primary. |
| Multi-region | Single Railway region. Single InsForge region. | When users in distant regions need lower latency, and you accept multi-region replica ops ([Railway multi-region replicas](https://docs.railway.com/deployments/scaling)). |
| Self-host InsForge | Rejected | Do not self-host. CLI and agent skills are cloud-only. Managed InsForge keeps the agent workflow. |

Vertical scale on one replica comes first.
Railway grows vCPU and memory within plan limits before horizontal scale ([docs](https://docs.railway.com/deployments/scaling)).

---

## 5. Out of scope / anti-patterns

Do not do these in day-one work:

- Enable a second Railway replica before the durable rate-limit store.
- Add Redis or another external queue. The queue stays in Postgres `jobs`.
- Run the jobs worker as a separate Railway service. That breaks one deploy unit.
- Move Database, Auth, or Storage off managed InsForge.
- Use Nixpacks instead of the explicit `Dockerfile`.
- Deploy this app to Vercel as the production server place.
- Re-open Closed-by-decision items (roles `text[]`, cosmetic naming, Wave 6 SQL metrics vs ML) without an explicit product decision.

Data backlog is empty: see adherence plan § Next (**Closed-by-decision** / Done).

---

## 6. Workload and latency notes

Writes go through Postgres RPCs and `write_commands`.
Lists that matter for day-one speed use server-side pages.
Remaining lists stop at 1000 rows until their table needs full server-side paging.

Uploads go browser → InsForge Storage.
OCR and similar work enqueue jobs. Delay after upload is permitted.

The latency path is client → Railway Next → InsForge Postgres (and Storage for files).
Former edge-function hops are gone for production.

---

## 7. Relation to the Aug 30 audit

The Aug 30 audit measured against a vague “original design” while the live stack was still Vercel plus InsForge edge functions.
Phases 1–3 of the adherence plan moved the live stack to this shape.
This document replaces that vague target for the **system** lens.

Remaining system “later” items use the trigger table above.
Data-lens gaps are out of scope here.
