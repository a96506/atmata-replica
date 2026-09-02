# ERP access patterns

This document maps **user questions** to **answer paths** for each data section in atmata-ui-only.
Use it to decide what belongs in SQL, what belongs in storage/jobs, and how the UI or RPC layer answers each question. Former gaps are **Done** or **Closed-by-decision** (see per-module Status).

**Method:** For each module, list natural-language questions by role, then trace:
`UI route → src/lib/api/* → table or RPC → read pattern (listPage / listTable / RPC) → storage type`.

**Canonical system design:** [`system-design.md`](system-design.md)  
**Role UX implementation:** [`role-ux-plan.md`](role-ux-plan.md) (Phases 1–5 ✅)  
**Role keys:** `admin`, `approver`, `ap_clerk`, `ar_clerk`, `warehouse`, `buyer`, `sales_rep`, `accountant`, `period_adjust`, `audit_unlock`, `viewer` (+ `platform_admin` via separate table)

**Authority for UI write gates:** `src/lib/roles/capabilities.ts` (mirrors SQL `write_capability_roles()`).

---

## Post-login landing

After auth, `/[locale]` redirects via `landingPathForRoles(session.roles)` in `src/lib/roles/landing.ts`.

| Step | Function | Behavior |
|------|----------|----------|
| Primary persona | `resolvePrimaryRole(roles[])` | Precedence: `admin` → `approver` → desk roles (`sales_rep`, `ar_clerk`, `ap_clerk`, `buyer`, `warehouse`) → `accountant` → `viewer` — **not** `roles[0]` |
| Landing path | `landingPathForRoles(roles[])` | Maps primary role to locale-agnostic path |

| Primary role | Landing path |
|--------------|--------------|
| `approver` | `/inbox` |
| `admin` | `/dashboard` |
| `accountant` | `/accounting/journal-entries` |
| `sales_rep` | `/sales` |
| `ar_clerk` | `/sales/invoices` |
| `ap_clerk` | `/purchasing/bills` |
| `buyer` | `/purchasing/purchase-orders` |
| `warehouse` | `/inventory/stock-moves` |
| `viewer` | `/dashboard` |

**Also used by:** `src/app/[locale]/page.tsx` (redirect), `src/lib/insforge/session.ts` (`session.role` for dev switcher).

---

## Storage split (day-one)

| Kind | Use for | Examples in this app |
|------|---------|----------------------|
| **SQL (Postgres/InsForge)** | Transactional docs, master data, ledger, approvals, audit | `journal_entries`, `vendor_bills`, `stock_moves`, `customers` |
| **Object storage** | Files only; DB holds keys/URLs | `documents` bucket (attachments), `imports` bucket (bank CSV, OCR PDFs) |
| **Jobs queue** | Async work after user leaves | `jobs` table: OCR, email, recon suggest, PDF, scheduler |
| **Computed in app** | Derived KPIs (until materialized) | Overview reorder alerts, dashboard KPIs from report RPCs |

---

## 1. Finance / Accounting

**Routes:** `/accounting/journal-entries`, `/accounting/financials`, `/accounting/reconciliation`, `/accounting/close`, `/accounting/invoices` (OCR), `/settings/coa`, `/settings/tax-codes`, `/settings/fx-rates`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Show posted JEs this month" (accountant) | `/accounting/journal-entries?page=` → `listJournalEntriesPage()` → `journal_entries` (**listPage**) |
| "Create manual adjusting entry" (accountant) | `/accounting/journal-entries/new` → `createJournalEntryAction` → RPC `create_journal_entry` |
| "Balance sheet for Q2" (accountant) | `/accounting/financials?type=balance-sheet&period=` → RPC `report_balance_sheet(p_period_id)` |
| "Trial balance now" (accountant) | `?type=trial-balance&period=` → `FinancialPeriodSelect` → RPC `report_trial_balance(p_period_id)`; omit `period` for all posted periods (banner when unfiltered) |
| "Import bank CSV and match" (accountant) | `/accounting/reconciliation` → upload to **`imports`** bucket → RPC `import_bank_statement` |
| "Accept this match" (accountant) | `/accounting/reconciliation/[id]` → RPC `accept_reconciliation_match` |
| "Start month-end close" (accountant) | `/accounting/close?period=` → RPC `start_period_close` + head counts on doc tables |
| "Scan vendor PDF into bill" (ap_clerk) | `/accounting/invoices` (also linked from Purchasing nav) → `document_processing_jobs` + **`jobs` type `ocr`** |
| "What VAT codes apply?" (admin / accountant) | `/settings/tax-codes` → `tax_codes` via `MasterCrud` (`writeOperation="create_tax_code"`) |
| "What's USD/KWD today?" (accountant) | `/settings/fx-rates` → `fx_rates` — **MasterCrud writable** (A3) |

### Key tables / RPCs

- **Tables:** `journal_entries`, `journal_entry_lines`, `accounts`, `fiscal_periods`, `bank_statements`, `bank_statement_lines`, `reconciliation_*`, `tax_codes`, `fx_rates`, `document_processing_jobs`
- **Report RPCs:** `report_pnl`, `report_balance_sheet`, `report_cash_flow`, `report_trial_balance`, `report_ar_aging`
- **Write RPCs:** `create_journal_entry`, `post_document`, `import_bank_statement`, `*_reconciliation_*`, `start_period_close`, `set_fiscal_period_status`

### Status (Done / Closed)

- **Trial balance:** **Done** — period filter (Wave 3–4) + date/account/vendor dimension filters (Wave 7 `20260901190700`); PDF passes `p_period_id`
- **GL report:** **Done (Wave 7)** — `report_general_ledger()` + financials GL tab (`20260901190600`)
- **CoA CRUD:** **Done (Wave 7)** — `20260901191100_accounts-sdk-write.sql` + MasterCrud
- **FX rates + currencies:** **Done (A3)** — MasterCrud writable (not static)
- **JE approval:** **Done (A1)** — `20260902120000_journal-entry-approval.sql` wired to UI/actions
- **Report FX:** **Done (A2)** — FX to company base in report RPCs + PDF GL/TB (`20260902130000_report-fx-to-company-base.sql`)
- **Bank statements list:** **Done (A2)** — `listPage`

---

## 2. Sales / Quote-to-Cash (Q2C)

**Routes:** `/sales`, `/sales/quotes`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/receipts`, `/sales/returns`, `/sales/credit-notes`, `/settings/customers`, `/settings/price-lists`, `/settings/price-lists/[id]`

### Document chain

```
opportunity → quote → sales_order → delivery_note → customer_invoice → customer_receipt
                                              ↘ customer_return → credit_note (auto on post)
```

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Open quotes for customer X" (sales_rep) | `/sales/quotes?page=` → `listQuotesPage()` → `quotes` (**listPage** ✅) |
| "Create quote" (sales_rep) | `/sales/quotes/new` → `create_quote` RPC — **FIXED:** dual-cap `sales_rep` **or** `ar_clerk` via `assert_write_capability_any` |
| "Ship SO-0105" (warehouse) | `/sales/deliveries/new` → `create_delivery_note` → post → `stock_moves` OUT |
| "Invoice from SO" (ar_clerk) | `/sales/invoices/new` → `create_customer_invoice` → post → GL + `qty_invoiced` |
| "List unpaid invoices" (ar_clerk) | `/sales/invoices?page=` → `listCustomerInvoicesPage()` (**listPage**) |
| "Record payment" (ar_clerk) | `/sales/receipts/new` → `create_customer_receipt` → post → updates `customer_invoices.paid` |
| "List customer receipts" (ar_clerk) | `/sales/receipts?page=` → `listCustomerReceiptsPage()` (**listPage** ✅) |
| "Customer on credit hold?" (sales_rep) | `/settings/customers/[id]` → `customers.payment_status`, `exposure` |
| "Price for SKU on list?" (sales_rep) | **FIXED:** `resolve_price_list_item` RPC called from quote/SO forms via `applyResolvedLinePrices()` |
| "Manage price list lines" (ar_clerk) | `/settings/price-lists/[id]` → `price_list_items` CRUD via `MasterCrud` |
| "Credit note for return?" (ar_clerk) | `/sales/credit-notes` — **auto-created** on `post_customer_return`; **Done (A1):** apply-credit via `ApplyCreditTab` + RPC (contra-AR GL) |
| "Pipeline deals" (sales_rep) | `/sales` pipeline tab → `listOpportunitiesPage({ limit, offset, activeOnly: true })` (**listPage** ✅) via `parseListPage(searchParams)` — `activeOnly` adds `stage IN ('qualified','proposal','negotiation')` via `ReadFilter.in` in `listPage()`; `SalesPipelineTab` passes `serverPagination` to `DataTable`; read-only for sales_rep |
| "Create opportunity" (ar_clerk) | `/sales` pipeline tab → `createOpportunityAction` → SDK insert on `opportunities` — gated `create_opportunity` (**FIXED:** ar_clerk + admin) |
| "Deep-link to pipeline tab" (sales_rep) | `/sales?tab=pipeline` — **Done (Wave 5):** `parseSalesOverviewTab()` in `sales-overview-tabs.tsx`; `SalesOverviewTabs` syncs `?tab=` (default `quotes`; clears `page` on tab change) |

### Key tables / RPCs

- **Tables:** `opportunities`, `quotes`, `quote_lines`, `sales_orders`, `delivery_notes`, `customer_invoices`, `customer_receipts`, `customer_returns`, `credit_notes`, `customers`, `price_lists`, `price_list_items`
- **Create RPCs:** `create_quote`, `create_sales_order`, `create_delivery_note`, `create_customer_invoice`, `create_customer_receipt`, `create_customer_return`
- **Create SDK:** `opportunities` via `createOpportunityAction` (`create_opportunity` capability)
- **Read RPCs:** `resolve_price_list_item`
- **Posting:** `post_delivery_note` → stock; `post_customer_invoice` → GL; `post_customer_return` → stock + credit note

### Status (Done / Closed)

1. **Opportunities:** **Done** — create (SDK + RLS); pipeline **listPage** + `activeOnly` + `?tab=pipeline` (Wave 5); edit/delete (**Wave 7** `20260901180200` + `20260901191000`)
2. **Credit notes:** auto-created on return post; **apply-credit** **Done (A1)** — `ApplyCreditTab` + `apply_credit_to_invoice` (+ contra-AR GL)

---

## 3. Purchasing / Procure-to-Pay (P2P)

**Routes:** `/purchasing`, `/purchasing/purchase-requisitions`, `/purchasing/purchase-orders`, `/purchasing/bills`, `/purchasing/rfqs`, `/purchasing/goods-receipts`, `/purchasing/vendor-returns`, `/purchasing/scan` (redirect), `/settings/suppliers`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Create PO from PR" (buyer) | `/purchasing/purchase-orders/new` → `create_purchase_order` |
| "Which POs are open?" (buyer) | `/purchasing/purchase-orders?page=` → `listPurchaseOrdersPage()` (**listPage** ✅) |
| "Receive PO into stock" (warehouse) | `/purchasing/goods-receipts/new` → `create_goods_receipt` → post → `stock_moves` IN |
| "Enter vendor bill from GRN" (ap_clerk) | `/purchasing/bills/new?from=&fromGrn=` → `create_vendor_bill` |
| "3-way match status?" (ap_clerk) | Bill detail Match tab + `vendor_bills.three_way_match` from `evaluate_three_way_match()` |
| "Bills pending approval" (approver) | `/inbox` + `/purchasing/bills/[id]` → `approval_requests` |
| "Upload supplier PDF" (ap_clerk) | **FIXED discoverability:** Purchasing nav "Scan vendor bill" → `/accounting/invoices`; alias `/purchasing/scan` redirects there |
| "Compare RFQ quotes" (buyer) | `/purchasing/rfqs/[id]` — **FIXED:** `DocActionBar` + `RfqAwardButtons`; `award_rfq` wired |
| "List RFQs" (buyer) | `/purchasing/rfqs?page=` → `listRfqsPage()` (**listPage** ✅) |
| "Open PRs" (buyer) | `/purchasing/purchase-requisitions?page=` → `listPurchaseRequisitionsPage()` (**listPage** ✅) |
| "List vendor payments" (ap_clerk) | `/purchasing/payments?page=` → `listVendorPaymentsPage()` (**listPage** ✅) |
| "Supplier bank details?" (ap_clerk) | `/settings/suppliers` → `suppliers` — **FIXED:** `MasterCrud` gated (`writeOperation="create_supplier"`) |
| "What's in the match queue?" (approver) | `/purchasing` tab Bill match → **FIXED:** real links to bill/GRN/PO routes (no demo toasts) |

### Key tables / RPCs

- **Tables:** `purchase_requisitions`, `rfqs`, `rfq_quotes`, `purchase_orders`, `goods_receipts`, `vendor_bills`, `vendor_payments`, `suppliers`
- **Match:** `evaluate_three_way_match(p_bill_id)` on save/post
- **OCR:** `document_processing_jobs` + **`imports`** bucket → `create_vendor_bill` with `source_ocr_job_id`

### Status (Done / Closed)

1. **`price_alerts`** — **Done (Wave 6 compute):** computed from transactional data — `price_list_item_history` trigger + `refresh_price_alerts()` RPC (list price changes + PO vs last receipt variance); `getPurchasingOverview()` → `listPriceAlerts()`; KPI + alert banner on `/purchasing`. **Not demo seed, not ML:** rule-based SQL recompute from price history and purchase receipts
2. **`vendor_scores`** tab — **Done (Wave 6 compute):** computed from transactional data — `refresh_vendor_scores()` RPC aggregates on-time GRN delivery vs PO expected date + return quality from posted vendor returns; read-only tab on purchasing overview. **Not demo seed, not ML:** weighted SQL score (60% on-time, 40% quality)
3. **Debit notes list** — **FIXED (Wave 4):** `listDebitNotesPage()` (**listPage** ✅)

---

## 4. Inventory & Warehouse

**Routes:** `/inventory`, `/inventory/stock-moves`, `/inventory/products/[sku]`, `/inventory/transfers`, `/inventory/adjustments`, `/settings/products`, `/settings/warehouses`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "How many units of X on hand?" (warehouse) | `/inventory` → `getInventoryOverview()` — **FIXED (Wave 3):** batch RPC `company_on_hand_by_product()` (one call, not per-product fan-out) |
| "On-hand by warehouse for SKU X" (warehouse) | `/inventory/products/[sku]` → RPC `item_stock_by_warehouse` |
| "Stock movements today" (warehouse) | `/inventory/stock-moves?page=&warehouse=` → `listStockMovesPage()` (**listPage** ✅; warehouse filter) |
| "Items below reorder point" (buyer) | `/inventory` reorder tab — `on_hand < products.reorder_point` (company-wide) |
| "List internal transfers" (warehouse) | `/inventory/transfers?page=` → `listInternalTransfersPage()` (**listPage** ✅) |
| "Transfer WH-1 → WH-2" (warehouse) | `/inventory/transfers/new` → `create_internal_transfer` → post → paired OUT+IN moves |
| "List stock adjustments" (warehouse) | `/inventory/adjustments?page=` → `listStockAdjustmentsPage()` (**listPage** ✅) |
| "Cycle count variance" (warehouse) | `/inventory/adjustments/new` → `create_stock_adjustment` → post → move + inventory JE |
| "Receive PO stock" (warehouse) | `/purchasing/goods-receipts/*` → `post_grn` → `stock_moves` |
| "Ship SO stock" (warehouse) | `/sales/deliveries/*` → `post_delivery_note` → `stock_moves` |
| "Add/edit product" (admin) | `/settings/products` → SDK CRUD gated (`writeOperation="create_product"`) |
| "Add warehouse" (admin) | `/settings/warehouses` — **Done (B1):** warehouses/locations CRUD |
| "Demand forecast" (buyer) | `/inventory` forecast tab — **Done (Wave 6 compute):** `inventory_forecasts` computed from outbound `stock_moves` (90-day avg daily out × 30/90-day horizons); `getInventoryOverview()` → `listInventoryForecasts()` + `pivotForecasts()`; `refresh_inventory_forecasts()` RPC + daily `metrics_refresh` scheduler job. **Not demo seed, not ML:** moving-average demand projection from stock move history |

### Key tables / RPCs

- **Source of truth:** `stock_moves` (append-only)
- **Read RPCs:** `company_on_hand_by_product`, `item_snapshot`, `item_stock_by_warehouse`, `item_moves`, `item_lots`, `item_purchase_history`, `item_sales_history`
- **Write RPCs:** `create_internal_transfer`, `create_stock_adjustment`; posting via `post_grn`, `post_delivery_note`, returns

### Status (Done / Closed)

1. **Warehouses / locations:** **Done (B1)** — CRUD in settings UI (`locations` wired)
2. **Reorder → PR/PO:** **Done (B1)** — overview links; `operational_alerts` surfaces in inbox
3. **Forecasts tab:** **Done (Wave 6 compute)** — `inventory_forecasts` from outbound stock moves; `refreshMetricsIfStale()` + daily `metrics_refresh`. **Closed-by-decision:** not ML — SQL moving-average is the product

---

## 5. Platform, Master, Inbox & Dashboard

**Routes:** `/dashboard`, `/inbox`, `/settings/*`, `/platform-admin`, global search, AI copilot

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Cash position and MTD revenue" (admin) | `/dashboard` → `getDashboardOverview()` → RPCs `report_pnl`, `report_cash_flow`, `report_ar_aging` |
| "What awaits my approval?" (approver) | `/inbox` → `notifications` + synthesized pending docs → `transition_document` |
| "Invite user with roles" (admin) | `/settings/users` → RPC `invite_user`, `set_member_roles` |
| "Configure approval bands" (admin) | `/settings/approval-rules` → `approval_rules` (`writeOperation="create_approval_rule"`) |
| "Find customer ACME" (all) | Global search → RPC `search_all(p_query)`; nav filtered by role |
| "Attach PO to file" (all) | `AttachmentsTab` → **`documents`** bucket + `attachments` row |
| "Who changed this bill's state?" (admin) | Document `HistoryTab` → `audit_events` |
| "Provision new tenant" (platform_admin) | `/platform-admin` → RPC `platform_provision_company` |
| "Adopt lines from PO to bill" (buyer) | `AdoptToButton` → `/api/adoption` — adoptable graph in browser scratch; POST persists **`adoption_events`**; GET **`fetchAdoptionMetrics()`** from SQL (fallback empty if migration not applied) |
| "AI summary of financials" (all) | Dashboard → `requestCfoNarrative()` → `/api/ai` stream |
| "What settings can I edit?" (role) | **FIXED:** `MasterCrud writeOperation` + `filterNavigation()` in `AppSidebar` / command palette |

### Navigation filter (FIXED)

`src/lib/roles/nav-filter.ts` — `filterNavigation(navigation, roles)` hides leaves when session lacks required `capabilities` or `readRoles`. Config in `src/config/navigation.ts`.

### Status (Done / Closed)

- **Masters:** CoA / FX / warehouses **Done** (writable where landed); payment-terms / branches / sequences **Closed-by-decision** — read-only-by-design
- **Inbox `pending:*` mark-read:** **Done (C)**
- **`/settings/audit`:** **Done (C)**
- **Adoption graph:** client-side adoptable graph **Closed-by-decision** (intentional); metrics persist via `adoption_events` (**Done Wave 3**)

---

## Read-pattern cheat sheet

| Pattern | When | Modules using it |
|---------|------|------------------|
| **listPage** (server paging) | Heavy transactional lists | **Q2C:** quotes, SOs, deliveries, customer invoices, customer receipts, returns, credit notes, **opportunities** · **P2P:** PRs, POs, GRNs, RFQs, vendor bills, vendor payments, vendor returns, **debit notes** · **Finance:** JEs · **Inventory:** stock moves, internal transfers, stock adjustments · **Master:** customers, suppliers |
| **listTable** (≤1000 cap) | Remaining lists / export helpers | Most settings master lists (products, tax codes, …); bank statements moved to **listPage** (A2) |
| **RPC read** | Aggregates / reports | Financial statements, AR aging, Product 360, global search, `resolve_price_list_item`, `company_on_hand_by_product`, `item_stock_by_warehouse` |
| **Direct query** | Specialized joins | Reconciliation matches, OCR jobs, period-close counts |
| **Write RPC** | All doc lifecycle | create_*, transition_document, post_document, approval RPCs |
| **SDK DML** | Master CRUD | customers, suppliers, products, tax codes, bank accounts, price_list_items, opportunities |
| **Jobs queue** | Async | OCR, email, recon, PDF, scheduler |
| **Storage buckets** | Files | `documents` (attachments), `imports` (bank CSV, OCR source) |

**Paging helpers:** `src/lib/list-paging.ts` (`parseListPage`, default limit 50) re-exported from `src/lib/db/read.ts` (`listPage`).

**Trigger:** Move a capped list to `listPage` when a tenant table exceeds 1000 rows (`ALL_PAGES_HARD_CAP` in `src/lib/db/read.ts`).

---

## Role × write capability matrix (authoritative: SQL + `capabilities.ts`)

| Capability | Roles | Typical operations |
|------------|-------|-------------------|
| `sales_rep` | `sales_rep`, `admin` | Create/submit draft quotes & SOs (**FIXED** — SQL arm + dual-cap RPCs) |
| `ar_clerk` | `ar_clerk`, `admin` | Invoices, receipts, customers, price lists, opportunities |
| `ap_clerk` | `ap_clerk`, `admin` | Bills, payments, suppliers, OCR |
| `buyer` | `buyer`, `admin` | PRs, POs, RFQs, award |
| `warehouse` | `warehouse`, `admin` | GRNs, deliveries, returns, transfers, adjustments |
| `accountant` | `accountant`, `admin` | JEs, tax codes, bank accounts, fiscal periods |
| `approver` | `approver`, `admin` | Approval resolve |
| Company admin | `admin` (`is_company_admin()`) | Users, company, products, approval rules |
| Platform admin | `platform_admins` table + `is_platform_admin()` | Tenant provisioning |

**Dual-capability ops** (OR): `create_quote`, `create_sales_order` → `sales_rep` **or** `ar_clerk`.

**UI alignment:** `PermissionGate operation=`, `MasterCrud writeOperation=`, `DocActionBar` / `legalActions`, and `filterNavigation()` all derive from `capabilities.ts`. Prior mismatches (`sales_rep` vs `ar_clerk` on quote/SO, ungated master pages, demo overview toasts) are **fixed** in role-ux Phases 1–4.

---

## Top cross-module gaps (closed backlog)

| # | Gap | Modules | Status |
|---|-----|---------|--------|
| 1 | UI role gates ≠ RPC write capabilities (`sales_rep` quote/SO) | Sales | **Done** — dual-cap SQL + `capabilities.ts` |
| 2 | RFQ award/send/close not wired in UI | Purchasing | **Done** — `DocActionBar` + award buttons |
| 3 | Purchasing overview actions are demo toasts | Purchasing | **Done** — real navigation links |
| 4 | OCR entry under Accounting not Purchasing | P2P + Accounting | **Done** — Purchasing nav + `/purchasing/scan` alias |
| 5 | Price list line items + resolver unused | Sales | **Done** — `[id]` CRUD + quote/SO auto-price |
| 6 | On-hand computed from capped move scan / N+1 RPC fan-out | Inventory overview | **Done (Wave 3)** — batch RPC `company_on_hand_by_product()` |
| 7 | Trial balance period filter + GL report | Finance | **Done (Wave 7)** — period filter (Wave 3) + dimension filters (`20260901190700`); `report_general_ledger()` + GL tab (`20260901190600`); JE `(company_id, date)` index |
| 8 | Master data CRUD lacks role-scoped UI gates | Settings | **Done** — `writeOperation` on MasterCrud; read-only pages gated |
| 9 | Opportunities + forecast tabs empty | Sales, Inventory | **Done (Wave 6 compute)** — opportunity create (SDK + `create_opportunity`); pipeline **listPage** + server pager + **`activeOnly`** stage filter ✅; **`?tab=pipeline` deep link** ✅; inventory forecast **computed from stock moves** (`refresh_inventory_forecasts` + `pivotForecasts`) — transactional SQL, not ML |
| 10 | Adoption metrics in-memory only | Platform | **Done (Wave 3)** — `adoption_events` + metrics API; client adoptable graph **Closed-by-decision** (intentional, Wave C) |
| 11 | Price alerts on purchasing overview | Purchasing | **Done (Wave 6 compute)** — rule-based SQL; **not ML** (Closed-by-decision) |
| 12 | JE approval + apply-credit GL | Finance / Sales | **Done (A1)** |
| 13 | Report FX + GL/TB PDF + bank statements listPage | Finance | **Done (A2)** |
| 14 | FX rates + currencies writable | Settings | **Done (A3)** |
| 15 | Warehouses/locations CRUD; reorder links; operational_alerts | Inventory / Inbox | **Done (B1)** |
| 16 | pending mark-read; `/settings/audit`; read-only masters by design | Platform | **Done / Closed (C)** |
| 17 | Cosmetic naming (Vendors / Purchasing / Inventory labels) | UI/i18n | **Done (Wave D)** — no schema rename |

Former § Next items from [`system-design-adherence-plan.md`](system-design-adherence-plan.md): roles join-table **Closed-by-decision** (keep `roles text[]`); naming **Closed** cosmetic; ML scoring/forecast **Closed** (Wave 6 SQL compute is the product). Multi-region / 2nd replica / self-host InsForge remain **Out of scope**.

---

## Relation to system design

Access patterns confirm the day-one storage split in [`system-design.md`](system-design.md):

- **SQL** holds all relational/transactional ERP data and the job queue.
- **Storage** holds unstructured files (attachments, imports).
- **Jobs** handles delayed work (OCR, email, recon, PDF).
- **No secondary DB** for logs — audit lives in `audit_events`.

No open data backlog: see [`system-design-adherence-plan.md`](system-design-adherence-plan.md) § Next (**Closed-by-decision** / Done). GL report, trial balance dimension filters, and JE indexes are **Done (Wave 7)**.

---

## Migration ledger (Wave 3–4)

| Migration | Wave | Delivers |
|-----------|------|----------|
| `20260901150000_adoption-events.sql` | 3 | `adoption_events` table + metrics RPC |
| `20260901180000_company-on-hand-by-product.sql` | 3 | Batch on-hand RPC |
| `20260901180100_trial-balance-period-filter.sql` | 3 | `report_trial_balance(p_period_id)` |
| `20260901180200_opportunities-sdk-write.sql` | 3 | Opportunity create + RLS |
| `20260901180300_vendor-scores-stub.sql` | 4 | `vendor_scores` table + seed rows |
| `20260901180400_price-alerts-stub.sql` | 5 | `price_alerts` table + seed rows |
| `20260901180500_inventory-forecasts-stub.sql` | 5 | `inventory_forecasts` table + seed rows |
| `20260901190200_inventory-forecasts-compute.sql` | 6 | `refresh_inventory_forecasts()` from outbound stock moves |
| `20260901190300_price-alerts-compute.sql` | 6 | `refresh_price_alerts()` + price history trigger |
| `20260901190400_vendor-scores-compute.sql` | 6 | `refresh_vendor_scores()` from GRN/returns |
| `20260901190500_inventory-forecasts-grant.sql` | 6 | authenticated GRANT + `metrics_refresh` scheduler job |
| `20260901190600_general-ledger-report.sql` | 7 | `report_general_ledger()` + JE `(company_id, date)` index |
| `20260901190700_trial-balance-dimension-filters.sql` | 7 | date/account/vendor params on `report_trial_balance()` |
| `20260901190800_price-alerts-history-backfill.sql` | 7 | price history backfill for alerts compute |
| `20260901190900_apply-credit-to-invoice.sql` | 7 | apply customer credit to open invoice RPC |
| `20260901191000_opportunities-delete.sql` | 7 | scoped DELETE on opportunities |
| `20260901191100_accounts-sdk-write.sql` | 7 | CoA SDK CRUD + role-scoped RLS |

---

*Updated 2026-09-02 (Wave D): zero open Gaps; A1–C + Waves 3–7 marked Done/Closed-by-decision; cosmetic Vendors/Purchasing/Inventory labels. Prior: Wave 7 finance, Wave 6 computed metrics, role-ux Phases 1–5, Wave 1 list paging.*
