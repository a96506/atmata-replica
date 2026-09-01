# Role UX implementation plan

**Source:** [`access-patterns.md`](access-patterns.md) top-10 gaps + UI/RPC role mismatches.  
**Goal:** Fix trust-breaking permission gaps and ship role-aware navigation, gates, and actions.  
**Constraint:** Each phase completes in **one Cursor session** (~2–4 hours). Verify before starting the next.

---

## Role split (evidence-based, not speculation)

Derived from **47 unique user questions** in [`access-patterns.md`](access-patterns.md), cross-checked against SQL `write_capability_roles()`, `doc_state_transitions`, and `PermissionGate` / `legalActions`.

### Keep all 11 assignable keys — do not merge desks

| Layer | Roles | Why |
|-------|-------|-----|
| Operational write | `buyer`, `warehouse`, `ap_clerk`, `ar_clerk`, `accountant`, `sales_rep` | Each owns a distinct question cluster in access-patterns |
| Workflow | `approver` | Inbox + `resolve_approval_request` |
| Tenant admin | `admin` | Users, rules, master config, dashboard |
| Overlays | `period_adjust` | Soft-close posting bypass only — not a persona |
| Read default | `viewer` | Default invite; read/search, no writes |
| Unimplemented | `audit_unlock` | Schema/i18n only — **do not assign** until unlock RPC exists |

### Persona bundles (typical job titles)

| Persona | Role(s) | Primary questions they own |
|---------|---------|--------------------------|
| Front-office sales | `sales_rep` | Draft quotes/SOs, check customer credit |
| AR desk | `ar_clerk` | Invoice, receipt, collections |
| AP desk | `ap_clerk` | OCR, vendor bills, 3-way match, suppliers |
| Procurement | `buyer` | PR → RFQ → PO, reorder signals |
| Warehouse ops | `warehouse` | GRN, DN, transfers, adjustments, stock moves |
| Finance controller | `accountant` (+ optional `period_adjust`) | GL, recon, close, financials |
| Approver | `approver` (often stacked) | Inbox approvals, match exceptions |
| Admin | `admin` | Settings, users, executive dashboard |
| Read-only | `viewer` | Search, KPIs, list reads |

### Key decision: `sales_rep` vs `ar_clerk` → **Option C**

Add **`sales_rep` as a seventh SQL write capability** scoped to quote/SO create + submit only. Do **not** grant full `ar_clerk` (invoicing/posting stays AR desk). UI already gates quote/SO forms to `sales_rep`; stale-draft alerts already target `sales_rep`. Align SQL to UI — do not strip sales from the UI.

### Question coverage today vs should

| Role | SHOULD answer | TODAY (write paths) | Main gap |
|------|---------------|---------------------|----------|
| `sales_rep` | 4 | 2/4 | Create quote/SO RPC rejects |
| `buyer` | 5 | 4/5 | RFQ send/award/close UI missing |
| `approver` | 3 | 2/3 | Purchasing overview demo toasts |
| `accountant` | 8 | 8/8 | Mis-gates on receipt/adjustment forms |
| Others | — | Full for primary writes | Settings lack UI gates |

---

## Per-role UX (what each employee sees)

**Principle:** Home = first screen that answers their top job question. Nav = modules they write in. Hide create buttons they cannot use.

### Post-login landing (replace universal `/inbox` for everyone)

| Role | Home route |
|------|------------|
| `approver` | `/inbox` |
| `admin` | `/dashboard` |
| `accountant` | `/accounting/journal-entries` |
| `sales_rep` | `/sales` |
| `ar_clerk` | `/sales/invoices` |
| `ap_clerk` | `/purchasing/bills` (+ OCR CTA → `/accounting/invoices`) |
| `buyer` | `/purchasing/purchase-orders` |
| `warehouse` | `/inventory/stock-moves` |
| `viewer` | `/dashboard` (read-only) |

Resolve primary role from `roles[]` with precedence: `admin` > `approver` > desk roles > `accountant` > `viewer` — **not** `roles[0]`.

### Role × module visibility (summary)

| Role | Show (write) | Read-only | Hide |
|------|--------------|-----------|------|
| `sales_rep` | Sales quotes/SO | Customers | Purchasing, Accounting, Inventory |
| `ar_clerk` | Sales invoices/receipts | Customers | Quotes create, Purchasing, DN create (warehouse) |
| `ap_clerk` | Purchasing bills/payments, OCR | Suppliers | Sales, GL |
| `buyer` | PR/RFQ/PO | Inventory reorder, suppliers | Sales, Accounting |
| `warehouse` | Inventory, GRN, DN | Products | Sales quotes, AP bills |
| `accountant` | Full Accounting | Sales/Purch lists for close | Master write (unless admin) |
| `approver` | Inbox | Pending doc lists | All `/new`, Settings |
| `admin` | Everything | — | — |
| `viewer` | — | All lists + dashboard | All `/new`, Users, approval rules |

### Primary home actions (must work after Phase 1–2)

Each role gets **3–5 buttons** on their home screen linking to real routes — never demo toasts. Examples:

- **sales_rep:** New quote, Open quotes, New SO, Customer credit check
- **ap_clerk:** Scan vendor PDF, New bill, Bills list, Bill from GRN
- **buyer:** New PO, Open POs, New RFQ, Reorder alerts
- **warehouse:** New GRN, New delivery, Stock moves, New transfer
- **approver:** Inbox queue, Pending bills, Pending POs

---

## Rule architecture

### Problem today

Role rules live in four places that drift:

| Layer | Location | What it controls |
|-------|----------|------------------|
| SQL (authoritative for writes) | `write_capability_roles()` in `migrations/20260815155000_write-command-foundation.sql` | RPC `assert_write_capability('…')` |
| Form gates | `PermissionGate` on 15 `*/new/page.tsx` files | Hard-coded `allow={["sales_rep", …]}` |
| Doc transitions | `legalActions()` in `src/lib/state-machines/index.ts` | Per-action `roles: Role[]` |
| Navigation | `src/config/navigation.ts` + `AppSidebar.tsx` | No role filtering |

Known mismatches (UI allows → RPC rejects) — **fixed in Phase 1**:

- ~~`sales_rep` on quote/SO create → RPC requires `ar_clerk`~~ → dual-cap `sales_rep|ar_clerk`
- ~~`accountant` on customer receipt create → RPC requires `ar_clerk`~~ → gate = `ar_clerk` only
- ~~`accountant` on stock adjustment create → RPC requires `warehouse`~~ → gate = `warehouse` only

### Single source of truth

**Yes:** introduce `src/lib/roles/capabilities.ts` as the **UI/TS authority**, with SQL as the **runtime enforcement mirror**.

```
┌─────────────────────────────────────────────────────────────┐
│  src/lib/roles/capabilities.ts                              │
│  • WRITE_CAPABILITIES → roles[]                             │
│  • OPERATIONS → capability   (create_quote → ar_clerk|…)    │
│  • ROUTES → capability|readRoles                            │
│  • TRANSITIONS → capability   (submit quote → ar_clerk|…)  │
│  • can(role, capability) / rolesFor(operation)              │
└──────────────┬──────────────────────────────────────────────┘
               │ read by
    ┌──────────┼──────────┬─────────────────┐
    ▼          ▼          ▼                 ▼
PermissionGate  legalActions  filterNavigation  MasterCrud/List CTAs
               │                              │
               │  src/lib/roles/capabilities.test.ts
               │  asserts TS map == SQL CASE arms
               ▼
write_capability_roles()  ← migration keeps CASE in sync (or codegen later)
assert_write_capability() ← never trust client; always enforce
```

#### File layout

```
src/lib/roles/
  capabilities.ts      # maps + helpers
  capabilities.test.ts # sync + can() unit tests
  index.ts             # re-exports
```

#### Capability model

Keep **coarse write capabilities** aligned with SQL today:

`buyer | warehouse | ap_clerk | ar_clerk | accountant | approver | admin`

Add one extension for Q2C front-office (product intent from stale-draft alerts):

`sales_rep` — may **create/submit draft** quotes and sales orders only (not invoice/receipt/post).

Map in TS:

```ts
export const WRITE_CAPABILITIES = {
  buyer: ["buyer", "admin"],
  warehouse: ["warehouse", "admin"],
  ap_clerk: ["ap_clerk", "admin"],
  ar_clerk: ["ar_clerk", "admin"],
  accountant: ["accountant", "admin"],
  approver: ["approver", "admin"],
  sales_rep: ["sales_rep", "admin"],          // new SQL arm
  admin: ["admin"],
} as const;
```

**Operations map** (RPC / server action → capability):

| Operation | Capability | Notes |
|-----------|------------|-------|
| `create_quote`, `create_sales_order` | `sales_rep` **or** `ar_clerk` | dual-capability; SQL uses `assert_write_capability_any` |
| `create_customer_invoice`, `create_customer_receipt` | `ar_clerk` | |
| `create_delivery_note` | `warehouse` | matches SQL `assert_write_capability('warehouse')` |
| `create_purchase_order`, `create_purchase_requisition`, `award_rfq` | `buyer` | |
| `create_vendor_bill`, `create_vendor_payment` | `ap_clerk` | |
| `create_goods_receipt` | `warehouse` | |
| `create_stock_adjustment`, `create_internal_transfer` | `warehouse` | |
| `create_journal_entry` | `accountant` | |
| `transition_document` approve/reject | `approver` | per doc type in TRANSITIONS map |

#### Aligning the three consumers

1. **`PermissionGate`** — replace `allow: Role[]` with `operation: OperationKey` (or `capability`). Internally calls `rolesForOperation(operation)`. Keep `allow` as escape hatch for read-only pages.

2. **`legalActions`** — replace inline `roles: Role[]` on each `Action` with `capability: WriteCapability` (or `capabilities: WriteCapability[]`). Filter via `can(role, cap)`.

3. **`write_capability_roles` (SQL)** — add migration arm for `sales_rep`; add `assert_write_capability_any(variadic capabilities)` for dual-cap ops. **Do not** weaken RLS; only adjust RPC entry guards.

4. **Navigation** — extend `NavLeaf` with optional `operations?: OperationKey[]` or `capabilities?: WriteCapability[]`. `filterNavigation(navigation, role)` in `src/lib/roles/nav-filter.ts`; `AppSidebar` calls it. Viewer sees read routes; write leaves hidden when `can` fails.

#### Sync enforcement

`capabilities.test.ts` must assert:

- Every `WRITE_CAPABILITIES` key has a matching `WHEN` arm in SQL (document the migration filename in test comment).
- Every `PermissionGate` operation key resolves to roles that are a **subset of** SQL-permitted roles (never superset).
- Sample integration: `sales_rep` + `create_quote` → allowed; `sales_rep` + `create_customer_invoice` → denied.

#### What stays separate

- **`viewer`**, **`period_adjust`**, **`audit_unlock`** — special-purpose; gate individual routes/actions explicitly, not via write capabilities.
- **`platform_admin`** — `platform_admins` table + `is_platform_admin()`; never fold into company role map.
- **RLS read policies** — unchanged; UI hiding is UX, not security. Writes always fail at RPC if misconfigured.

---

## Implementation phases

### Phase 1 — Capabilities foundation + trust-breaking fixes ✅ COMPLETE 2026-09-01

**Goal:** No role can reach a form or primary action that the RPC layer will reject.

**Files / RPCs to touch**

| Area | Paths |
|------|-------|
| New capability module | `src/lib/roles/capabilities.ts`, `capabilities.test.ts`, `index.ts` |
| SQL | New migration: `assert_write_capability_any`, `write_capability_roles('sales_rep')`, update `create_quote` + `create_sales_order` to accept `sales_rep` **or** `ar_clerk` |
| PermissionGate | `src/components/form/PermissionGate.tsx` — add `operation` prop |
| Create forms (15 pages) | `src/app/[locale]/(app)/sales/quotes/new/page.tsx`, `sales/orders/new/page.tsx`, `sales/receipts/new/page.tsx`, `inventory/adjustments/new/page.tsx`, plus all other `*/new/page.tsx` under sales/, purchasing/, inventory/, accounting/ |
| State machine | `src/lib/state-machines/index.ts` — quote/SO submit → `sales_rep` capability |
| Actions (verify only) | `src/lib/actions/q2c.ts`, `src/lib/actions/inventory-tx.ts` |

**Acceptance criteria (verify per role with dev role switcher)**

| Role | Must work | Must be blocked (gate or RPC) |
|------|-----------|-------------------------------|
| `sales_rep` | Create + save draft quote/SO | Create invoice, receipt, adjustment |
| `ar_clerk` | Create quote, SO, invoice, receipt | Create PO, vendor bill, adjustment |
| `accountant` | Create journal entry | Create receipt, stock adjustment |
| `warehouse` | Create adjustment, transfer, GRN | Create quote, bill |
| `viewer` | View lists (read via RLS) | All `*/new` routes show PermissionGate denial |
| `admin` | All of the above | — |

**Manual verify:** Submit quote as `sales_rep` → succeeds (no `WRITE:FORBIDDEN`). Submit receipt as `accountant` → gate denial before form. Submit adjustment as `accountant` → gate denial.

**Agent prompt**

```
Context: atmata-ui-only ERP on InsForge. docs/access-patterns.md documents UI/RPC role mismatches.
Read docs/role-ux-plan.md § Rule architecture before coding.

Task — Phase 1 only:
1. Create src/lib/roles/capabilities.ts with WRITE_CAPABILITIES, OPERATIONS, can(), rolesForOperation().
2. Add migration: write_capability_roles('sales_rep'), assert_write_capability_any(text[]),
   update create_quote and create_sales_order to allow sales_rep OR ar_clerk.
3. Extend PermissionGate with optional `operation` prop; keep backward-compatible `allow`.
4. Refactor all */new/page.tsx PermissionGates to use operation keys from capabilities.ts.
   Fix known mismatches: remove accountant from receipts + adjustments gates.
5. Update legalActions quote/SO submit to use capability keys.
6. Add capabilities.test.ts including SQL sync comments and role matrix cases.

Constraints:
- Minimize scope — no nav filter, no RFQ page, no purchasing overview yet.
- SQL remains enforcement; TS mirrors SQL, never the reverse alone.
- Do not change RLS policies.
- Do not add docs beyond code comments.
- Match existing code style; reuse Role type from @/types.

Do NOT: refactor unrelated list paging, price lists, inventory overview, financial reports.

Verify:
- npm run typecheck && npm test -- capabilities
- Dev role switcher: sales_rep creates quote end-to-end; accountant blocked on /sales/receipts/new and /inventory/adjustments/new.
- ar_clerk still creates invoice/receipt.
```

---

### Phase 2 — Discoverability: nav filter, RFQ actions, purchasing workflows, OCR placement

**Goal:** Each role sees relevant routes; broken/demo workflows replaced with real actions; AP OCR findable from Purchasing.

**Files / RPCs to touch**

| Area | Paths |
|------|-------|
| Nav filter | `src/lib/roles/nav-filter.ts`, `src/config/navigation.ts` (add `capabilities` on leaves), `src/components/app/AppSidebar.tsx` |
| RFQ detail | `src/app/[locale]/(app)/purchasing/rfqs/[id]/page.tsx` — add `DocActionBar`; wire `award_rfq` via existing `src/lib/actions/documents.ts` |
| RFQ compare tab | Same file — "Award" button per vendor quote calling `awardRfqAction` when state = `quotes_received` |
| Purchasing overview | `src/app/[locale]/(app)/purchasing/page.tsx`, delete/replace `purchasing-demo-actions.tsx` |
| Real actions | Link PO suggestions → `/purchasing/purchase-orders/new?from=…`; bill match → `/purchasing/bills/[id]`; receiving → `/purchasing/goods-receipts/[id]` |
| OCR discoverability | `src/config/navigation.ts` — add Purchasing leaf "Scan vendor bill" → `/accounting/invoices`; optional alias `/purchasing/scan` redirect |
| Settings gates | `src/app/[locale]/(app)/settings/suppliers/page.tsx`, `customers/page.tsx`, `products/page.tsx` — wrap `MasterCrud` write actions |
| RPCs | `award_rfq`, `transition_document` (rfq send/close/record_quotes) — already exist |

**Acceptance criteria**

| Role | Verify |
|------|--------|
| `buyer` | Sidebar shows Purchasing + RFQs; RFQ detail has Send / Record quotes / Award / Close; award creates PO link |
| `ap_clerk` | Sidebar shows bills, OCR link under Purchasing; overview bill-match row opens real bill detail |
| `warehouse` | Sidebar hides Accounting settings; overview receiving row opens GRN detail |
| `sales_rep` | Sidebar hides Purchasing, Accounting (except nothing), Settings master write pages |
| `viewer` | Sidebar shows read modules only; no "New" in overview action columns |
| `approver` | Inbox + bill detail accessible; overview bill-match links to approval context |

**Manual verify:** RFQ `draft` → Send → `sent`; record quotes → `quotes_received`; Award → `awarded` + PO link. Purchasing overview buttons navigate (no toast-only demo).

**Agent prompt**

```
Context: Phase 1 merged — src/lib/roles/capabilities.ts exists. Read docs/role-ux-plan.md Phase 2.

Task — Phase 2 only:
1. Add optional `capabilities` (or `operations`) to NavLeaf in src/config/navigation.ts.
   Implement filterNavigation(role) in src/lib/roles/nav-filter.ts; use in AppSidebar.
   Map: Sales → sales_rep|ar_clerk read; Purchasing → buyer|ap_clerk|warehouse; Accounting → accountant|ap_clerk; Settings write → admin (+ module-specific).
2. Wire DocActionBar on purchasing/rfqs/[id]/page.tsx (docType rfq). Ensure award uses awardRfqAction from lib/actions/documents.ts.
   Add per-vendor Award in Compare tab when state = quotes_received.
3. Replace purchasing-demo-actions.tsx toasts with Link/navigation to real routes or transitionDocumentAction.
   PoSuggestionActions → PO new with from param; BillMatchActions → bill detail; ReceivingDemoActions → GRN detail.
4. Add OCR/scan link under Purchasing nav pointing to /accounting/invoices (same page, better discoverability).
5. Gate MasterCrud create/edit/delete on settings suppliers, customers, products using capabilities (admin for products, ap_clerk for suppliers, ar_clerk for customers — match RLS intent).

Do NOT: change SQL capabilities from Phase 1; no price list items; no inventory RPC refactor.

Verify:
- buyer: RFQ full lifecycle on a seeded RFQ
- ap_clerk: purchasing overview bill row opens bill detail
- sales_rep: purchasing module hidden in sidebar
- npm run typecheck
```

---

### Phase 3 — Power-user: price lists, inventory accuracy, list filters

**Goal:** Sales pricing works end-to-end; inventory overview trustworthy; warehouse can filter moves.

**Files / RPCs to touch**

| Area | Paths |
|------|-------|
| Price list lines | `src/app/[locale]/(app)/settings/price-lists/[id]/page.tsx` (new), `src/lib/api/master.ts`, `src/lib/actions/master.ts` |
| Price resolver | `src/app/[locale]/(app)/sales/quotes/new/new-quote-form.tsx`, `sales/orders/new/new-so-form.tsx` — call RPC `resolve_price_list_item` on product+customer select |
| SQL RPC | `resolve_price_list_item` (existing — read only) |
| Inventory overview | `src/lib/api/inventory-overview.ts` — replace `listStockMoves()` scan with per-SKU `item_stock_by_warehouse` or batch query; add comment if N+1, batch in single RPC call |
| Stock moves filter | `src/app/[locale]/(app)/inventory/stock-moves/page.tsx`, `src/lib/api/inventory-tx.ts`, `src/components/list/ListStateFilter.tsx` |
| List CTAs | Quote/PO list pages — hide "New" when `!can(role, capability)` using shared hook `useCanOperation` |

**Acceptance criteria**

| Role | Verify |
|------|--------|
| `admin` / `ar_clerk` | Add price list line; create quote → unit price auto-fills from customer's price list |
| `sales_rep` | Quote form gets resolved price (read RPC); cannot edit price list settings |
| `warehouse` | Stock moves page filters by warehouse; overview on-hand matches product 360 for sample SKU |
| `buyer` | Reorder tab still read-only; numbers match RPC snapshot not capped move sum |

**Manual verify:** Product with 1001+ moves — overview on-hand equals `/inventory/products/[sku]` RPC value.

**Agent prompt**

```
Context: Phases 1–2 done. capabilities.ts + nav filter in place.

Task — Phase 3 only:
1. Add price list detail page with price_list_items CRUD (MasterCrud or line table).
   Wire SDK DML on price_list_items table via lib/actions/master.ts.
2. In new-quote-form and new-so-form, on product line add call to resolve_price_list_item RPC
   (add wrapper in lib/api/master.ts or q2c.ts). Pre-fill unit price when customer + product selected.
3. Refactor getInventoryOverview() to compute on-hand via item_stock_by_warehouse RPC (aggregate across warehouses)
   instead of summing listStockMoves() (1000 cap). Handle empty products gracefully.
4. Add warehouse filter to stock-moves list page (query param → listStockMovesPage filter).
5. Hide list-page "New" buttons when useCanOperation fails (quotes, POs minimum).

Do NOT: migrate all lists to listPage; no GL/trial balance; no opportunities CRUD.

Verify:
- Price list line → quote line price auto-populated
- inventory overview on_hand matches product detail RPC for 3 SKUs
- warehouse filter on stock-moves works
- npm run typecheck && npm test
```

---

### Phase 4 — Settings role matrix + DocActionBar capability sweep

**Goal:** All settings pages and document actions respect the same capability map; no stray hard-coded role arrays.

**Files / RPCs to touch**

| Area | Paths |
|------|-------|
| Settings pages | All `src/app/[locale]/(app)/settings/*/page.tsx` — tax-codes, coa, fx-rates, warehouses, bank-accounts, payment-terms, sequences, users, approval-rules, company, branches, fiscal-calendar, price-lists |
| MasterCrud | `src/components/master/MasterCrud.tsx` — prop `writeOperation?: OperationKey`; disable mutating UI when denied |
| DocActionBar | `src/components/doc/DocActionBar.tsx` — rely on legalActions capability refactor from Phase 1; sweep remaining doc detail pages |
| Command palette | Component that indexes `allNavLeaves` — apply `filterNavigation` |
| Tests | Extend `capabilities.test.ts` — every OperationKey used in PermissionGate exists in OPERATIONS map |

**Capability assignments (settings)**

| Page | Write capability | Read (viewer) |
|------|------------------|---------------|
| users, approval-rules, company, sequences | `admin` | admin only |
| coa, fiscal-calendar, tax-codes, fx-rates, bank-accounts, payment-terms | `accountant` | viewer read-only |
| products, warehouses, branches | `admin` | viewer read-only |
| customers | `ar_clerk` | viewer read-only |
| suppliers | `ap_clerk` | viewer read-only |
| price-lists | `ar_clerk` | viewer read-only |

**Acceptance criteria**

| Role | Verify |
|------|--------|
| `viewer` | Can open settings pages but MasterCrud shows no Add/Edit/Delete |
| `ap_clerk` | Suppliers editable; customers read-only |
| `ar_clerk` | Customers + price lists editable; suppliers read-only |
| `accountant` | COA/tax/fx/bank pages editable (where not read-only by design); no user admin |
| `admin` | Full settings write |

**Agent prompt**

```
Context: capabilities.ts is the UI authority. Phases 1–3 complete.

Task — Phase 4 only:
1. Audit every settings/*/page.tsx — wrap writes with MasterCrud writeOperation or PermissionGate.
   Use matrix in docs/role-ux-plan.md Phase 4 table.
2. Extend MasterCrud to accept writeOperation; hide create/edit/delete when !can(role, op).
3. Apply filterNavigation to command palette search results.
4. Grep for hard-coded role arrays in components (roles: ["buyer"…]) — replace with capability refs in state-machines.
5. Expand capabilities.test.ts to fail if OPERATIONS keys drift from PermissionGate usage.

Do NOT: add new SQL migrations unless a settings SDK write lacks RLS (fix in UI only).
Do NOT: implement COA/warehouse CRUD if pages are intentionally read-only — gate only, add TODO comment.

Verify per role matrix above via dev role switcher on settings/*
npm run typecheck && npm test
```

---

### Phase 5 — Deferred data items (documented scope, minimal viable)

**Goal:** Close remaining backlog items that are data/reporting-heavy without blocking role UX; defer full implementations with explicit stubs.

**Files / RPCs to touch**

| Area | Paths | Scope |
|------|-------|-------|
| Trial balance period | `src/app/[locale]/(app)/accounting/financials/page.tsx`, `src/lib/api/gl.ts` | Pass `period` query param to `report_trial_balance` if RPC supports; else UI period selector + banner "period filter pending RPC" |
| List paging | `src/lib/api/q2c.ts`, `p2p.ts`, `rfq.ts` + list pages for quotes, POs, GRNs | Add `listQuotesPage` etc. using `listPage` pattern from `src/lib/list-paging.ts` |
| Opportunities | `src/app/[locale]/(app)/sales/page.tsx` pipeline tab | Minimal CRUD via SDK on `opportunities` if RLS allows admin/ar_clerk; else read-only + "Create" gated |
| Credit notes | `src/app/[locale]/(app)/sales/credit-notes/` | Document auto-only; add read-only apply-credit placeholder tab on invoice detail |
| Adoption metrics | `src/app/api/adoption/route.ts` | Add SQL comment + stub returning empty metrics; link from AdoptToButton tooltip |
| Empty tabs | Purchasing vendor_scores, inventory forecasts | Keep empty states; add i18n "Coming soon" keyed to role (buyer/admin see roadmap note) |

**Acceptance criteria**

| Role | Verify |
|------|--------|
| `accountant` | Financials trial balance page accepts period query; no regression for other reports |
| `sales_rep` / `ar_clerk` | Quotes list paginates past 1000 without silent truncation (test with mock or comment) |
| `admin` | Opportunities tab allows create if in scope; otherwise gated empty state |
| All | No new UI/RPC role mismatches introduced (run Phase 1 test suite) |

**Agent prompt**

```
Context: Role UX phases 1–4 complete. This phase handles deferred DATA items from access-patterns.md #7–10.

Task — Phase 5 only (minimal viable, do not gold-plate):
1. Trial balance: add period selector to accounting/financials?type=trial-balance; wire to RPC if param exists,
   otherwise show honest banner referencing system-design-adherence-plan.md deferral.
2. Add listPage for quotes and purchase_orders (follow listCustomerInvoicesPage pattern + list-paging.ts).
   Update quotes and PO list pages to use server pagination.
3. Sales pipeline opportunities tab: if opportunities table writable via SDK for ar_clerk/admin, add minimal
   create form; else read-only list with PermissionGate on create.
4. Credit notes: add read-only "Apply credit" section on customer invoice detail (no RPC if none exists).
5. Mark vendor_scores, forecasts, adoption metrics as deferred with accessible empty states — no fake data.

Do NOT: build full GL report page, full credit apply RPC, or materialized on-hand view.
Do NOT: weaken capability gates from prior phases.

Verify:
- npm run typecheck && npm test
- Re-run capabilities.test.ts — zero regressions
- Quotes/PO lists use page= param
```

---

## Gap → phase mapping

| # | Gap (access-patterns) | Phase |
|---|------------------------|-------|
| 1 | UI role gates ≠ RPC write capabilities | **1** |
| 2 | RFQ award/send/close not wired | **2** |
| 3 | Purchasing overview demo toasts | **2** |
| 4 | OCR under Accounting not Purchasing | **2** |
| 5 | Price list items + resolver unused | **3** |
| 6 | On-hand from capped move scan | **3** |
| 7 | Trial balance / GL report deferred | **5** (trial balance only) |
| 8 | Master data lacks role-scoped UI gates | **4** |
| 9 | Opportunities + forecast tabs empty | **5** (opportunities); forecasts stub |
| 10 | Adoption metrics in-memory only | **5** (stub) |

---

## Session checklist (every phase)

1. Read prior phase acceptance criteria — confirm green before starting.
2. Run `npm run typecheck` and targeted tests.
3. Smoke-test **three roles** minimum: one front-office (`sales_rep`), one module clerk (`ap_clerk` or `warehouse`), one `viewer`.
4. Update this doc with completion date on the phase heading if desired.

*Generated 2026-09-01 from `docs/access-patterns.md` and codebase analysis.*
