# ERP access patterns

This document maps **user questions** to **answer paths** for each data section in atmata-ui-only.
Use it to decide what belongs in SQL, what belongs in storage/jobs, and where the UI or RPC layer has gaps.

**Method:** For each module, list natural-language questions by role, then trace:
`UI route → src/lib/api/* → table or RPC → read pattern (listPage / listTable / RPC) → storage type`.

**Canonical system design:** [`system-design.md`](system-design.md)  
**Role keys:** `admin`, `approver`, `ap_clerk`, `ar_clerk`, `warehouse`, `buyer`, `sales_rep`, `accountant`, `period_adjust`, `audit_unlock`, `viewer` (+ `platform_admin` via separate table)

---

## Storage split (day-one)

| Kind | Use for | Examples in this app |
|------|---------|----------------------|
| **SQL (Postgres/InsForge)** | Transactional docs, master data, ledger, approvals, audit | `journal_entries`, `vendor_bills`, `stock_moves`, `customers` |
| **Object storage** | Files only; DB holds keys/URLs | `documents` bucket (attachments), `imports` bucket (bank CSV, OCR PDFs) |
| **Jobs queue** | Async work after user leaves | `jobs` table: OCR, email, recon suggest, PDF, scheduler |
| **Computed in app** | Derived KPIs (until materialized) | Overview on-hand from `stock_moves`, reorder alerts |

---

## 1. Finance / Accounting

**Routes:** `/accounting/journal-entries`, `/accounting/financials`, `/accounting/reconciliation`, `/accounting/close`, `/accounting/invoices` (OCR), `/settings/coa`, `/settings/tax-codes`, `/settings/fx-rates`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Show posted JEs this month" (accountant) | `/accounting/journal-entries?page=` → `listJournalEntriesPage()` → `journal_entries` (**listPage**) |
| "Create manual adjusting entry" (accountant) | `/accounting/journal-entries/new` → `createJournalEntryAction` → RPC `create_journal_entry` |
| "Balance sheet for Q2" (accountant) | `/accounting/financials?type=balance-sheet&period=` → RPC `report_balance_sheet(p_period_id)` |
| "Trial balance now" (accountant) | `?type=trial-balance` → RPC `report_trial_balance()` — **no period filter** |
| "Import bank CSV and match" (accountant) | `/accounting/reconciliation` → upload to **`imports`** bucket → RPC `import_bank_statement` |
| "Accept this match" (accountant) | `/accounting/reconciliation/[id]` → RPC `accept_reconciliation_match` |
| "Start month-end close" (accountant) | `/accounting/close?period=` → RPC `start_period_close` + head counts on doc tables |
| "Scan vendor PDF into bill" (ap_clerk) | `/accounting/invoices` → `document_processing_jobs` + **`jobs` type `ocr`** |
| "What VAT codes apply?" (admin) | `/settings/tax-codes` → `tax_codes` via `MasterCrud` |
| "What's USD/KWD today?" (accountant) | `/settings/fx-rates` → `fx_rates` — **read-only UI** |

### Key tables / RPCs

- **Tables:** `journal_entries`, `journal_entry_lines`, `accounts`, `fiscal_periods`, `bank_statements`, `bank_statement_lines`, `reconciliation_*`, `tax_codes`, `fx_rates`, `document_processing_jobs`
- **Report RPCs:** `report_pnl`, `report_balance_sheet`, `report_cash_flow`, `report_trial_balance`, `report_ar_aging`
- **Write RPCs:** `create_journal_entry`, `post_document`, `import_bank_statement`, `*_reconciliation_*`, `start_period_close`, `set_fiscal_period_status`

### Gaps

- Trial balance ignores period; no date/account/vendor filters (deferred in adherence plan)
- No dedicated GL report RPC + page
- CoA read-only — no account CRUD
- FX rates read-only; `/settings/currencies` is static (not SQL)
- JE approval workflow not wired despite approval-rules seed
- Reports hardcode KWD; FX not applied in report RPCs

---

## 2. Sales / Quote-to-Cash (Q2C)

**Routes:** `/sales`, `/sales/quotes`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/receipts`, `/sales/returns`, `/sales/credit-notes`, `/settings/customers`, `/settings/price-lists`

### Document chain

```
opportunity → quote → sales_order → delivery_note → customer_invoice → customer_receipt
                                              ↘ customer_return → credit_note (auto on post)
```

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Open quotes for customer X" (sales_rep) | `/sales/quotes` → `listQuotes()` → `quotes` (**listTable ≤1000**) |
| "Create quote" (sales_rep) | `/sales/quotes/new` → `create_quote` RPC — **RPC requires `ar_clerk`, UI allows `sales_rep`** |
| "Ship SO-0105" (warehouse) | `/sales/deliveries/new` → `create_delivery_note` → post → `stock_moves` OUT |
| "Invoice from SO" (ar_clerk) | `/sales/invoices/new` → `create_customer_invoice` → post → GL + `qty_invoiced` |
| "List unpaid invoices" (ar_clerk) | `/sales/invoices?page=` → `listCustomerInvoicesPage()` (**server paging ✅**) |
| "Record payment" (ar_clerk) | `/sales/receipts/new` → `create_customer_receipt` → post → updates `customer_invoices.paid` |
| "Customer on credit hold?" (sales_rep) | `/settings/customers/[id]` → `customers.payment_status`, `exposure` |
| "Price for SKU on list?" (sales_rep) | RPC `resolve_price_list_item` exists — **not called from UI** |
| "Credit note for return?" (ar_clerk) | `/sales/credit-notes` — **auto-created** on `post_customer_return`; no manual create |

### Key tables / RPCs

- **Tables:** `opportunities`, `quotes`, `quote_lines`, `sales_orders`, `delivery_notes`, `customer_invoices`, `customer_receipts`, `customer_returns`, `credit_notes`, `customers`, `price_lists`, `price_list_items`
- **Create RPCs:** `create_quote`, `create_sales_order`, `create_delivery_note`, `create_customer_invoice`, `create_customer_receipt`, `create_customer_return`
- **Posting:** `post_delivery_note` → stock; `post_customer_invoice` → GL; `post_customer_return` → stock + credit note

### Gaps (priority)

1. **`sales_rep` UI vs `ar_clerk` RPC** on quote/SO create and submit
2. **Price lists:** header CRUD only; no `price_list_items` UI; resolver unused
3. **Opportunities:** read-only on `/sales` pipeline tab; no CRUD
4. **Paging:** only invoices + customers paginated; other lists cap at 1000
5. **Credit notes:** auto-only; no apply-credit workflow

---

## 3. Purchasing / Procure-to-Pay (P2P)

**Routes:** `/purchasing`, `/purchasing/purchase-orders`, `/purchasing/bills`, `/purchasing/rfqs`, `/purchasing/goods-receipts`, `/purchasing/vendor-returns`, `/settings/suppliers`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Create PO from PR" (buyer) | `/purchasing/purchase-orders/new` → `create_purchase_order` |
| "Which POs are open?" (buyer) | `/purchasing/purchase-orders` → `listPurchaseOrders()` |
| "Receive PO into stock" (warehouse) | `/purchasing/goods-receipts/new` → `create_goods_receipt` → post → `stock_moves` IN |
| "Enter vendor bill from GRN" (ap_clerk) | `/purchasing/bills/new?from=&fromGrn=` → `create_vendor_bill` |
| "3-way match status?" (ap_clerk) | Bill detail Match tab + `vendor_bills.three_way_match` from `evaluate_three_way_match()` |
| "Bills pending approval" (approver) | `/inbox` + `/purchasing/bills/[id]` → `approval_requests` |
| "Upload supplier PDF" (ap_clerk) | **`/accounting/invoices`** (not Purchasing) → OCR job → draft bill |
| "Compare RFQ quotes" (buyer) | `/purchasing/rfqs/[id]` — **no DocActionBar**; cannot send/award/close |
| "Supplier bank details?" (ap_clerk) | `/settings/suppliers` → `suppliers` (**no PermissionGate**) |
| "What's in the match queue?" (approver) | `/purchasing` tab Bill match → `getPurchasingOverview()` — action buttons are **demo toasts** |

### Key tables / RPCs

- **Tables:** `purchase_requisitions`, `rfqs`, `rfq_quotes`, `purchase_orders`, `goods_receipts`, `vendor_bills`, `vendor_payments`, `suppliers`
- **Match:** `evaluate_three_way_match(p_bill_id)` on save/post
- **OCR:** `document_processing_jobs` + **`imports`** bucket → `create_vendor_bill` with `source_ocr_job_id`

### Gaps (priority)

1. **RFQ detail missing action bar** — `award_rfq` RPC unused
2. **Overview actions are demo toasts** — no real PO/bill workflows from dashboard
3. **OCR under Accounting**, not Purchasing — discoverability gap
4. **`price_alerts` / `vendor_scores`** tabs empty (no backend)
5. Most lists hard-capped at 1000 rows

---

## 4. Inventory & Warehouse

**Routes:** `/inventory`, `/inventory/stock-moves`, `/inventory/products/[sku]`, `/inventory/transfers`, `/inventory/adjustments`, `/settings/products`, `/settings/warehouses`

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "How many units of X on hand?" (warehouse) | `/inventory` → `getInventoryOverview()` — **sums `stock_moves` in Node** (≤1000 cap risk) |
| "On-hand by warehouse for SKU X" (warehouse) | `/inventory/products/[sku]` → RPC `item_stock_by_warehouse` |
| "Stock movements today" (warehouse) | `/inventory/stock-moves?page=` → `listStockMovesPage()` (**server paging ✅**) |
| "Items below reorder point" (buyer) | `/inventory` reorder tab — `on_hand < products.reorder_point` (company-wide) |
| "Transfer WH-1 → WH-2" (warehouse) | `/inventory/transfers/new` → `create_internal_transfer` → post → paired OUT+IN moves |
| "Cycle count variance" (warehouse) | `/inventory/adjustments/new` → `create_stock_adjustment` → post → move + inventory JE |
| "Receive PO stock" (warehouse) | `/purchasing/goods-receipts/*` → `post_grn` → `stock_moves` |
| "Ship SO stock" (warehouse) | `/sales/deliveries/*` → `post_delivery_note` → `stock_moves` |
| "Add/edit product" (admin) | `/settings/products` → direct SDK CRUD on `products` |
| "Add warehouse" (admin) | `/settings/warehouses` — **read-only** |

### Key tables / RPCs

- **Source of truth:** `stock_moves` (append-only)
- **Read RPCs:** `item_snapshot`, `item_stock_by_warehouse`, `item_moves`, `item_lots`, `item_purchase_history`, `item_sales_history`
- **Write RPCs:** `create_internal_transfer`, `create_stock_adjustment`; posting via `post_grn`, `post_delivery_note`, returns

### Gaps (priority)

1. **Overview on-hand** uses 1000-move cap — inaccurate at scale; use RPC/materialized view
2. **No warehouse filter** on stock moves list
3. **Warehouses read-only**; `locations` table unused in UI
4. **Reorder alerts display-only** — no PO/PR automation; job `operational_alerts` not in inbox
5. **Accountant on adjustment create UI** vs **warehouse-only RPC**

---

## 5. Platform, Master, Inbox & Dashboard

**Routes:** `/dashboard`, `/inbox`, `/settings/*`, `/platform-admin`, global search, AI copilot

### Typical questions → answer path

| Question (role) | Answer path |
|-----------------|-------------|
| "Cash position and MTD revenue" (admin) | `/dashboard` → `getDashboardOverview()` → RPCs `report_pnl`, `report_cash_flow`, `report_ar_aging` |
| "What awaits my approval?" (approver) | `/inbox` → `notifications` + synthesized pending docs → `transition_document` |
| "Invite user with roles" (admin) | `/settings/users` → RPC `invite_user`, `set_member_roles` |
| "Configure approval bands" (admin) | `/settings/approval-rules` → `approval_rules` |
| "Find customer ACME" (all) | Global search → RPC `search_all(p_query)` |
| "Attach PO to file" (all) | `AttachmentsTab` → **`documents`** bucket + `attachments` row |
| "Who changed this bill's state?" (admin) | Document `HistoryTab` → `audit_events` |
| "Provision new tenant" (platform_admin) | `/platform-admin` → RPC `platform_provision_company` |
| "Adopt lines from PO to bill" (buyer) | `AdoptToButton` → `/api/adoption` (in-memory graph, **no SQL metrics**) |
| "AI summary of financials" (all) | Dashboard → `requestCfoNarrative()` → `/api/ai` stream |

### Gaps

- Master settings pages lack UI role gates — RLS only
- Many masters read-only in UI (COA, payment terms, FX, branches, warehouses, sequences)
- Inbox synthesized `pending:*` rows cannot be marked read
- Search product hits may 404 (`/inventory/products/{sku}` vs settings)
- No dedicated `/settings/audit` page

---

## Read-pattern cheat sheet

| Pattern | When | Modules using it |
|---------|------|------------------|
| **listPage** (server paging) | Heavy lists, day-one | JEs, customer invoices, vendor bills, stock moves, customers, suppliers |
| **listTable** (≤1000 cap) | Remaining lists | Quotes, POs, GRNs, most master lists, bank statements |
| **RPC read** | Aggregates / reports | Financial statements, AR aging, Product 360, global search |
| **Direct query** | Specialized joins | Reconciliation matches, OCR jobs, period-close counts |
| **Write RPC** | All doc lifecycle | create_*, transition_document, post_document, approval RPCs |
| **SDK DML** | Master CRUD | customers, suppliers, products, tax codes, bank accounts |
| **Jobs queue** | Async | OCR, email, recon, PDF, scheduler |
| **Storage buckets** | Files | `documents` (attachments), `imports` (bank CSV, OCR source) |

**Trigger:** Move a capped list to `listPage` when a tenant table exceeds 1000 rows (`ALL_PAGES_HARD_CAP` in `src/lib/db/read.ts`).

---

## Role × write capability matrix (authoritative: SQL)

| Capability | Roles |
|------------|-------|
| `ar_clerk` | `ar_clerk`, `admin` |
| `ap_clerk` | `ap_clerk`, `admin` |
| `buyer` | `buyer`, `admin` |
| `warehouse` | `warehouse`, `admin` |
| `accountant` | `accountant`, `admin` |
| `approver` | `approver`, `admin` (approval resolve) |
| Company admin | `admin` (`is_company_admin()`) |
| Platform admin | `platform_admins` table + `is_platform_admin()` |

**Known UI/RPC mismatches:** `sales_rep` can open quote/SO forms but RPC needs `ar_clerk`; accountant on receipt/adjustment create forms but RPC may need `ar_clerk`/`warehouse`.

---

## Top cross-module gaps (design backlog)

| # | Gap | Modules affected |
|---|-----|------------------|
| 1 | UI role gates ≠ RPC write capabilities | Sales, Inventory |
| 2 | RFQ award/send/close not wired in UI | Purchasing |
| 3 | Purchasing overview actions are demo toasts | Purchasing |
| 4 | OCR entry under Accounting not Purchasing | P2P + Accounting |
| 5 | Price list line items + resolver unused | Sales |
| 6 | On-hand computed from capped move scan | Inventory overview |
| 7 | Trial balance / GL report deferred | Finance |
| 8 | Master data CRUD lacks role-scoped UI gates | Settings |
| 9 | Opportunities + forecast tabs empty | Sales, Inventory |
| 10 | Adoption metrics in-memory only | Platform |

---

## Relation to system design

Access patterns confirm the day-one storage split in [`system-design.md`](system-design.md):

- **SQL** holds all relational/transactional ERP data and the job queue.
- **Storage** holds unstructured files (attachments, imports).
- **Jobs** handle delayed work (OCR, email, recon, PDF).
- **No secondary DB** for logs — audit lives in `audit_events`.

Deferred data items (trial balance filters, GL report, roles join table, naming alignment, JE indexes) are listed in [`system-design-adherence-plan.md`](system-design-adherence-plan.md) § Next.

---

*Generated 2026-09-01 from codebase analysis. Module deep-dives: Finance, Sales, Purchasing, Inventory, Platform agents.*
