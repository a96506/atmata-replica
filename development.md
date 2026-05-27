# Atmata Frontend — Development Plan

> Scope: **frontend only**. Backend team will wire APIs against the contract this branch exposes.
> Target: **multi-tenant SaaS**, **GCC** (Kuwait + Saudi + UAE), **en + ar with RTL**.
> Stack: Next.js 16 (Turbopack) · React 19 · Tailwind v4 · next-intl · radix-ui · lucide-react · sonner.

---

## Section 1 — Current State (as-is)

Legend: ✅ wired in-session · 🟡 visible but toast-only · ❌ missing.

### 1.1 Inbox — `src/app/[locale]/(app)/inbox/page.tsx`
- ✅ Read aggregated alert feed (AI / AP / recon / credit hold / supply / duplicates) with severity + confidence
- 🟡 Approve / Reject / Open Workspace row actions
- ❌ Deep-link to source document
- ❌ Filter / search / bulk actions

### 1.2 Dashboard — `src/app/[locale]/(app)/dashboard/page.tsx`
- ✅ Read static KPI cards (cash, MTD revenue, pending approvals, AI success rate, AR aging, AI alerts)
- ❌ Period selector / drill-down / comparatives

### 1.3 Accounting
- **Invoices list + detail**: ✅ list & OCR-extracted detail · 🟡 "+ New Invoice" / Upload / detail action · ❌ Match-to-PO · ❌ Post · ❌ Pay · ❌ Related-docs panel
- **Reconciliation**: ✅ list sessions & matches · 🟡 Accept / Unmatch / Search · ❌ Bank import (CSV/MT940/CAMT) · ❌ Rule builder
- **Financials**: ✅ P&L / BS / CF / TB tabs with hardcoded lines · ❌ Period selector · ❌ Drill-down · ❌ Comparatives
- **Close**: ✅ 10-step checklist · 🟡 Rescan / Run step · ❌ Real period lock affordance

### 1.4 Sales — `src/app/[locale]/(app)/sales/page.tsx`
- ✅ KPIs + Quotations / SOs / Customers / Pipeline tables (read-only)
- ✅ Quick Quote builder (qty edit, customer dropdown, exceptional flag)
- 🟡 Preview PDF · Send Quote
- ❌ Quote / SO / DN / Invoice detail pages
- ❌ Quote → SO / SO → DN / DN → Invoice conversion buttons
- ❌ Customer master · Product master · Price list · Tax engine

### 1.5 Purchasing — `src/app/[locale]/(app)/purchasing/page.tsx`
- ✅ KPIs + PO suggestions / Bill matching / Price alerts / Vendor scores / Receiving tables
- 🟡 Approve / Adjust / Reject PO · Approve / Flag Bill · Confirm receipt
- 🟡 "+ New PO" modal (client state only)
- ❌ PR · RFQ · PO detail · GRN detail · Vendor Return / Debit Note · Vendor Payment

### 1.6 Inventory — `src/app/[locale]/(app)/inventory/page.tsx`
- ✅ Reorder alerts · Stock levels · 30/90-day demand · Inbound / outbound shipments
- 🟡 Refresh · Delayed Note
- ❌ Multi-warehouse · Bin/location · Lot/serial · Stock move ledger · Transfer · Adjustment · Reservation · Costing

### 1.7 Settings — `src/app/[locale]/(app)/settings/page.tsx`
- ✅ Edit confidence thresholds (in-session)
- ❌ Company · Branches · Fiscal year · Currencies · COA · Tax codes · Sequences · Users · Roles · Integrations

### 1.8 Cross-cutting (missing everywhere)
- ❌ Real login / sign-out / user menu
- ❌ Company / branch switcher (multi-tenant)
- ❌ Full RTL audit per component
- ❌ Reusable Document detail layout (header + tabs + state-machine action bar + related docs + history)
- ❌ Reusable List layout (filters, saved views, bulk actions, export)
- ❌ Document numbering display
- ❌ Audit trail / history tab
- ❌ Attachments tab
- ❌ Notifications panel
- ❌ Global search
- ❌ Empty / loading / error states
- ❌ Form validation patterns
- ❌ Tax breakdown widget (per line + footer)
- ❌ Multi-currency display + FX widget (only `formatKwd` exists)
- ❌ FATOORA fields + QR (Saudi)
- ❌ Period-lock guard on date pickers

---

## Section 2 — Target State (document trails)

### 2.1 Procure-to-Pay (P2P)

```
PR → RFQ → PO → GRN → Vendor Bill → Vendor Payment
                              ▲
              Vendor Return / Debit Note (reverses GRN)
```

1. PR — pick items + qty + needed-by → submit → approve
2. RFQ — from approved PR → select vendors → record quotes → award
3. PO — from RFQ (or PR or blank) → vendor + currency + terms + lines + tax → send → confirmed
4. GRN — receive from PO → qty (partial OK) + serial/lot + condition → post
5. Vendor Bill — create from PO/GRN or auto-drafted by OCR → 3-way match → post
6. Vendor Payment — pay bill → bank + method + allocation → post
7. Vendor Return — return from GRN → generates Debit Note

### 2.2 Quote-to-Cash (Q2C)

```
Opportunity → Quote → SO → DN → Customer Invoice → Customer Receipt
                                                          ▲
                              Customer Return / Credit Note
```

1. Opportunity — stage + probability + next action
2. Quote — from Opportunity → customer + price list + lines + validity + terms → send PDF
3. SO — convert from Quote → reserves stock; blocked if credit hold or limit exceeded
4. DN — deliver from SO → pick/pack/ship (partial OK)
5. Customer Invoice — from SO or DN → post (Saudi: render FATOORA QR)
6. Customer Receipt — apply payment → match to invoice(s) → post
7. Customer Return — from DN → generates Credit Note

### 2.3 Inventory (between P2P and Q2C)

```
GRN ─┐                                ┌─► DN
     │                                │
     ├─► Stock Moves (SKU × WH × Lot) ┤
     │                                │
Transfer / Adjustment ────────────────┘
```

1. Stock Move — auto-created by GRN, DN, Return, Transfer, Adjustment
2. Internal Transfer — Warehouse A → B → pick → ship → receive
3. Stock Adjustment — counted qty + reason code → approval if over threshold → post
4. Reservation — created by SO confirm, consumed by DN, released on cancel/expiry
5. Lot/Serial picker — required on every line where item is lot-tracked

### 2.4 GL backbone

Every posted document creates a Journal Entry visible from its detail page.

| Document | Dr | Cr |
|---|---|---|
| GRN | Inventory | GR/IR clearing |
| Vendor Bill | GR/IR clearing, Input VAT | AP control |
| Vendor Payment | AP control | Bank |
| DN | COGS | Inventory |
| Customer Invoice | AR control | Revenue, Output VAT |
| Customer Receipt | Bank | AR control |
| Stock Adjustment | Inventory / Loss | Loss / Inventory |

---

## Section 3 — Document Lifecycle (editability + locking)

### 3.1 Generic state machine

```
DRAFT ─submit→ PENDING ─approve→ CONFIRMED ─post→ POSTED ─close period→ LOCKED ─archive→ ARCHIVED
  ▲                                            │              │
  │ freely editable                            │              │
  └─ edit blocked from here ───────────────────┘              │
                                                              │
              corrections only via reverse / counter doc ◄────┘
```

### 3.2 Editability matrix

| Document | Freely editable | Editable w/ approval | Fixed (counter-doc only) | Hard-locked |
|---|---|---|---|---|
| PR | DRAFT | PENDING | APPROVED | period locked |
| RFQ | DRAFT | SENT (limited) | RESPONSES RECEIVED | period locked |
| PO | DRAFT | PENDING | CONFIRMED (Change Order if no GRN yet) | CLOSED / period locked |
| GRN | DRAFT (rare) | — | POSTED → reverse via Return | period locked |
| Vendor Bill | DRAFT | PENDING / 3-way exception | POSTED → Debit Note or cancel-reissue | period locked |
| Vendor Payment | DRAFT | PENDING | POSTED → Payment Reversal | period locked |
| Quote | DRAFT, SENT (versioned) | EXPIRED | ACCEPTED | — |
| SO | DRAFT | PENDING | CONFIRMED (undelivered lines only) | DELIVERED+INVOICED |
| DN | DRAFT | — | POSTED → Customer Return | period locked |
| Customer Invoice | DRAFT | PENDING | POSTED → Credit Note (never edited) | period locked |
| Customer Receipt | DRAFT | — | POSTED → Receipt Reversal | period locked |
| Journal Entry | DRAFT | — | POSTED → Reversing JE | period locked |
| Stock Adjustment | DRAFT | PENDING (over threshold) | POSTED → opposite adjustment | period locked |

### 3.3 Period & year locking (UI behavior)

| Period state | Posting allowed? | UI affordance |
|---|---|---|
| Open | yes | normal |
| Soft-closed | only `period.adjust` role | banner warning, date picker shows warning icon |
| Hard-closed | no | date picker disables dates ≤ lock date; inline error on submit |
| Year-locked | only `audit.unlock` role | "Year locked" badge; Unlock action behind confirm dialog |

### 3.4 Audit trail rules

| Doc state | Recorded | Field-level history | Content immutable |
|---|---|---|---|
| DRAFT | every field change | yes | no |
| PENDING | every transition | yes | no |
| POSTED | transitions only | n/a | yes |
| LOCKED | transitions only | n/a | yes |

---

## Section 4 — Cross-Document Navigation (link map)

The right-rail "Related Documents" panel on every detail page renders these edges:

- PR → PO (1:N)
- RFQ → PO (1:1)
- PO ↔ GRN (1:N, per-line linkage)
- PO ↔ Vendor Bill (1:N)
- GRN ↔ Vendor Bill (3-way match)
- Vendor Bill ↔ Vendor Payment (N:N via allocation)
- Opportunity → Quote → SO → DN → Customer Invoice → Customer Receipt
- SO ↔ Reservation ↔ DN
- Customer Return → DN
- Vendor Return → GRN
- Every posted document → Journal Entry

Status mirroring shown on parent lines:
- PO line: `qty_ordered / qty_received / qty_invoiced`
- SO line: `qty_ordered / qty_delivered / qty_invoiced`
- Invoice header: `total / paid / balance`
- Quote header: `accepted? / converted to SO?`

---

## Section 5 — Objective Steps

> Every item is one verifiable outcome. Check `- [x]` when done.
> "i18n" on a line means: add keys to both `messages/en.json` and `messages/ar.json` and verify RTL layout.

### Phase F0 — Foundation

- [ ] Rename `src/middleware.ts` → `src/proxy.ts` (Next 16 deprecation warning)
- [ ] Add `src/types/index.ts` re-exporting every entity type defined below
- [ ] Add `src/types/common.ts` — `Money`, `Currency` (`KWD|SAR|AED|USD`), `LocaleCode` (`en|ar`), `PeriodStatus`, `DocState`, `Role`
- [ ] Add `src/types/audit.ts` — `AuditEvent { docId, docType, fromState, toState, by, at, reason }`
- [ ] Add `src/lib/api/_client.ts` — Promise-based fake service base with `sessionStorage` persistence and 150ms artificial latency
- [ ] Add `src/lib/state-machines/index.ts` — typed transitions per doc type; exports `legalActions(docType, state, role): Action[]`
- [ ] Add `src/lib/period.ts` — `periodStatusFor(date, fiscalCalendar): 'open'|'soft_closed'|'hard_closed'`
- [ ] Add `src/lib/numbering.ts` — render-only format helpers (`renderSequence('PO', year, seq)`)
- [ ] Add `src/lib/money.ts` — `formatMoney(amount, currency, locale)`, `parseMoney(str, currency)`
- [ ] Refactor `src/lib/utils.ts` — keep `cn` and `formatKwd`; have `formatKwd` call `formatMoney`
- [ ] Add `src/lib/tax.ts` — `calcLineTax(line, taxCode)`, `calcDocTotals(lines, taxCodes)` (pure functions; rule set passed in)
- [ ] Add `src/components/doc/StatusTimeline.tsx` — props `{ states: string[]; current: string }`; horizontal pill row
- [ ] Add `src/components/doc/RelatedDocs.tsx` — props `{ links: Array<{label, href, badge?}> }`
- [ ] Add `src/components/doc/ActionBar.tsx` — props `{ actions: Action[]; onAction(id) }`; disables on illegal transitions
- [ ] Add `src/components/doc/DocumentLayout.tsx` — header + StatusTimeline + tab strip + ActionBar + RelatedDocs slot
- [ ] Add `src/components/doc/DocumentList.tsx` — toolbar (filter, search, saved view, export) + table slot + empty/loading/error
- [ ] Add `src/components/state/Empty.tsx`, `Loading.tsx`, `ErrorState.tsx`
- [ ] Add `src/components/app/UserMenu.tsx` — avatar dropdown with sign-out
- [ ] Add `src/components/app/CompanySwitcher.tsx` — multi-tenant company/branch picker
- [ ] Wire `UserMenu` and `CompanySwitcher` into `src/app/[locale]/(app)/layout.tsx` top bar
- [ ] Audit Arabic RTL on every existing page; fix `dir`, paddings, icon mirroring; capture screenshots
- [ ] Add `src/components/dev/RoleSwitcher.tsx` (dev-only) — toggle current user role to test action-bar gating
- [ ] Relocate `src/lib/demo-data.ts` → `src/mocks/*.ts` (one file per resource)
- [ ] Components import only from `src/lib/api/*`, never from `src/mocks/*`
- [ ] i18n: extend `messages/en.json` & `messages/ar.json` for: app shell, auth, common doc actions, period banners
- [ ] `npm run build` clean · `npm run typecheck` clean

### Phase F1 — Master Data

- [ ] Add `src/types/master/*.ts` — `Company`, `Branch`, `FiscalCalendar`, `Period`, `Account`, `TaxCode`, `Currency`, `FxRate`, `PaymentTerm`, `Sequence`, `Customer`, `Supplier`, `Product`, `PriceList`, `Warehouse`, `Location`, `BankAccount`, `ApprovalRule`, `User`, `Role`
- [ ] Add `src/lib/api/companies.ts`, `branches.ts`, `fiscalCalendar.ts`, `coa.ts`, `taxCodes.ts`, `currencies.ts`, `paymentTerms.ts`, `sequences.ts`, `customers.ts`, `suppliers.ts`, `products.ts`, `priceLists.ts`, `warehouses.ts`, `bankAccounts.ts`, `approvalRules.ts`, `users.ts`
- [ ] Add pages under `src/app/[locale]/(app)/settings/`:
  - [ ] `company/page.tsx`, `branches/page.tsx`
  - [ ] `fiscal-calendar/page.tsx` — periods grid with open/soft/hard close toggles
  - [ ] `coa/page.tsx` — tree view
  - [ ] `tax-codes/page.tsx` — KW/SA/AE jurisdictions, rate + name (en/ar)
  - [ ] `currencies/page.tsx` + `fx-rates/page.tsx`
  - [ ] `payment-terms/page.tsx`
  - [ ] `sequences/page.tsx` — per doc type prefix + format
  - [ ] `customers/page.tsx` + `customers/[id]/page.tsx` (credit limit, on-hold flag, addresses)
  - [ ] `suppliers/page.tsx` + `suppliers/[id]/page.tsx` (bank + tax info)
  - [ ] `products/page.tsx` + `products/[id]/page.tsx` (UoM, tax class, costing, lot/serial flag)
  - [ ] `price-lists/page.tsx` + `price-lists/[id]/page.tsx`
  - [ ] `warehouses/page.tsx` + `warehouses/[id]/page.tsx` (with locations)
  - [ ] `bank-accounts/page.tsx`
  - [ ] `approval-rules/page.tsx` — doc type × amount × company → approver matrix
  - [ ] `users/page.tsx` + `users/[id]/page.tsx` (roles & permissions)
- [ ] Each master CRUD round-trips through the fake service (persists across refresh via sessionStorage)
- [ ] Each list reuses `DocumentList` shell; each detail reuses `DocumentLayout` shell
- [ ] i18n keys added for every label across both locales
- [ ] `npm run build` clean

### Phase F2 — Procure-to-Pay UI

- [ ] Add `src/types/p2p/*.ts` — `PurchaseRequisition`, `RFQ`, `PurchaseOrder`, `GoodsReceipt`, `VendorBill`, `VendorPayment`, `DebitNote`
- [ ] Add `src/lib/api/purchaseOrders.ts` with `list/get/create/update/submit/approve/post/cancel/changeOrder`
- [ ] Add `src/lib/api/goodsReceipts.ts` with `list/get/create/post/return`
- [ ] Add `src/lib/api/vendorBills.ts` with `list/get/createFromPo/createFromOcr/post/cancel/matchThreeWay`
- [ ] Add `src/lib/api/vendorPayments.ts` with `list/get/create/post/reverse/allocate`
- [ ] Add `src/lib/state-machines/po.ts`, `grn.ts`, `bill.ts`, `payment.ts`
- [ ] Add pages:
  - [ ] `purchasing/purchase-orders/page.tsx` + `[id]/page.tsx` (lines, taxes, terms, attachments, related, history)
  - [ ] `purchasing/goods-receipts/page.tsx` + `[id]/page.tsx` (per-line qty, lot/serial inputs)
  - [ ] `purchasing/bills/page.tsx` + `[id]/page.tsx` (3-way match panel: PO ↔ GRN ↔ Bill)
  - [ ] `purchasing/payments/page.tsx` + `[id]/page.tsx` (bill allocation table)
- [ ] Merge OCR-extracted invoices (today under `accounting/invoices`) into Vendor Bill detail; keep redirect from old route
- [ ] Existing purchasing dashboard buttons (Approve / Reject / Confirm receipt) wired to real service calls (optimistic + rollback on error)
- [ ] Related-docs panel populated on PO / GRN / Bill / Payment
- [ ] Period-guard on every Post action
- [ ] i18n + RTL pass for every new page
- [ ] `npm run build` clean

### Phase F3 — Inventory UI

- [ ] Add `src/types/inventory/*.ts` — `StockMove`, `InternalTransfer`, `StockAdjustment`, `Reservation`, `Lot`, `Serial`
- [ ] Add `src/lib/api/stockMoves.ts`, `transfers.ts`, `adjustments.ts`, `reservations.ts`, `lots.ts`
- [ ] Add `src/lib/state-machines/transfer.ts`, `adjustment.ts`
- [ ] Add pages:
  - [ ] `inventory/stock-moves/page.tsx` — ledger view filterable by SKU × WH × date
  - [ ] `inventory/transfers/page.tsx` + `[id]/page.tsx`
  - [ ] `inventory/adjustments/page.tsx` + `[id]/page.tsx` (reason code dropdown, approval threshold display)
  - [ ] `inventory/reservations/page.tsx`
  - [ ] `inventory/products/[sku]/page.tsx` — SKU dashboard (on hand, reserved, in transit, last moves)
- [ ] Replace existing inventory page tables with service-backed lists; keep KPIs
- [ ] Lot/Serial picker component used on GRN, DN, Transfer, Adjustment lines
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

### Phase F4 — Quote-to-Cash UI

- [ ] Add `src/types/q2c/*.ts` — `Opportunity`, `Quote`, `SalesOrder`, `DeliveryNote`, `CustomerInvoice`, `CustomerReceipt`, `CreditNote`, `CustomerReturn`
- [ ] Add `src/lib/api/opportunities.ts`, `quotes.ts`, `salesOrders.ts`, `deliveryNotes.ts`, `customerInvoices.ts`, `customerReceipts.ts`
- [ ] Add `src/lib/state-machines/quote.ts`, `so.ts`, `dn.ts`, `customerInvoice.ts`, `receipt.ts`
- [ ] Add pages:
  - [ ] `sales/opportunities/page.tsx` + `[id]/page.tsx`
  - [ ] `sales/quotes/page.tsx` + `[id]/page.tsx` (Send PDF action prints via browser)
  - [ ] `sales/orders/page.tsx` + `[id]/page.tsx`
  - [ ] `sales/deliveries/page.tsx` + `[id]/page.tsx`
  - [ ] `sales/invoices/page.tsx` + `[id]/page.tsx` — FATOORA QR placeholder when `company.taxProfile === 'SA'`
  - [ ] `sales/receipts/page.tsx` + `[id]/page.tsx`
  - [ ] `sales/credit-notes/page.tsx` + `[id]/page.tsx`
- [ ] Conversion buttons: Opportunity → Quote, Quote → SO, SO → DN, SO/DN → Invoice, Invoice → Receipt, DN → Return
- [ ] SO confirmation blocked when customer credit-hold or limit-exceeded (banner already exists; wire to the action bar)
- [ ] Replace existing sales page tables with service-backed lists; keep KPIs and Quick Quote
- [ ] Related-docs panel populated across the Q2C chain
- [ ] Period-guard on every Post action
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

### Phase F5 — Accounting Depth

- [ ] Add `src/types/gl/*.ts` — `JournalEntry`, `JournalLine`, `LedgerView`
- [ ] Add `src/lib/api/journalEntries.ts` with `list/get/create/post/reverse`
- [ ] Add `src/lib/api/ledger.ts` with `trialBalance(period)`, `pnl(period)`, `balanceSheet(asOf)`, `cashFlow(period)`
- [ ] Add pages:
  - [ ] `accounting/journal-entries/page.tsx` + `[id]/page.tsx` (debits / credits balanced indicator)
  - [ ] `accounting/ledger/page.tsx` — drill-down view per account
- [ ] Replace hardcoded `accounting/financials` with calls to `ledger.*` (period selector, comparatives)
- [ ] Rewire `accounting/close`:
  - [ ] Each of 10 steps deep-links to a filtered list (stale drafts, unbilled deliveries, missing bills, etc.)
  - [ ] "Lock period" action calls `fiscalCalendar.softClose` / `hardClose`
- [ ] Upgrade `accounting/reconciliation`:
  - [ ] Bank statement importer (CSV file picker, parses client-side into rows)
  - [ ] Rule builder UI (if amount matches & ref contains → propose match)
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

### Phase F6 — Approvals & Inbox Rewire

- [ ] Add `src/types/workflow/*.ts` — `Approval`, `ApprovalRequest`, `Notification`
- [ ] Add `src/lib/api/approvals.ts`, `notifications.ts`
- [ ] Inbox cards deep-link to the related document; approve/reject from inbox = approve/reject on doc, with same state machine
- [ ] Add `History` tab to every Document detail page rendering `AuditEvent[]`
- [ ] Add `src/components/app/NotificationsBell.tsx` in top bar (unread count + dropdown)
- [ ] Add `src/components/doc/Attachments.tsx` — drag-drop placeholder (real upload is backend)
- [ ] Approval-rule preview on doc detail: "Will route to: Khalid → Ahmed (>= KWD 5,000)"
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

### Phase F7 — AI Differentiator Rewire

- [ ] OCR drafts → real Vendor Bill drafts (already merged into bills in F2; here we wire AI confidence display + accept/reject into bill state machine)
- [ ] AI PO suggestions → "Create PR" / "Create PO" actions persisting to the fake service
- [ ] AI recon suggestions → wired to recon workspace (accept = post match; unmatch = remove allocation)
- [ ] Close checklist steps each invoke a real filter on the relevant list
- [ ] AI confidence chip component used uniformly (color coded thresholds from `settings/thresholds`)
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

### Phase F8 — GCC Compliance UI

- [ ] FATOORA Phase 2 fields on Customer Invoice form (seller VAT, buyer VAT for B2B, QR-data preview)
- [ ] QR code rendered on Saudi customer invoice detail + print stylesheet
- [ ] UAE VAT return export page (`accounting/tax-returns/uae/page.tsx`)
- [ ] Kuwait corp tax / excise export page (`accounting/tax-returns/kuwait/page.tsx`)
- [ ] Withholding tax fields on vendor payments where supplier flagged
- [ ] Company tax profile selector (`KW | SA | AE`) gating which fields appear
- [ ] Bilingual invoice template (en/ar columns rendered side-by-side for Saudi)
- [ ] i18n + RTL pass
- [ ] `npm run build` clean

---

## Section 6 — Definition of Done per Phase

### F0 — Foundation
- [ ] User can sign in (UX only), see avatar dropdown, switch company, switch locale, sign out
- [ ] Arabic locale flips layout direction cleanly across every existing page
- [ ] Every existing list page wrapped in `DocumentList`; every detail (only AP invoice for now) uses `DocumentLayout`
- [ ] `npm run dev` runs; `npm run build` clean; `npm run typecheck` clean
- [ ] Dev `RoleSwitcher` visible; toggling role flips which action-bar buttons are enabled

### F1 — Master Data
- [ ] Every master entity has a list page and a detail page with full CRUD
- [ ] Closing a period in `fiscal-calendar` disables date selection ≤ that date on every doc form (verified manually on at least one form)
- [ ] Numbering format defined in `sequences` is shown on doc forms as "Will be assigned on post"
- [ ] All labels translated; RTL audit pass

### F2 — Procure-to-Pay
- [ ] User can complete: PO → GRN → Bill → Payment, with every doc visible in the others' Related Documents rail
- [ ] 3-way match panel shows green/red badges per line for qty + price tolerance
- [ ] Posting into a hard-closed period is rejected at the form with a clear message
- [ ] Posted doc is read-only; only "Reverse" / "Credit Note" actions are offered
- [ ] All labels translated; RTL audit pass

### F3 — Inventory
- [ ] Posting a GRN creates Stock Moves visible in the per-SKU ledger
- [ ] Internal Transfer creates two Stock Moves (out from A, in to B)
- [ ] Stock Adjustment over threshold routes to approval; under threshold posts directly
- [ ] Lot/serial required on lot-tracked items; UI blocks save otherwise
- [ ] All labels translated; RTL audit pass

### F4 — Quote-to-Cash
- [ ] User can complete: Quote → SO → DN → Invoice → Receipt, with cross-doc rail populated each step
- [ ] SO confirm blocked when customer credit-hold or over limit; banner explains why
- [ ] Saudi invoice renders FATOORA QR placeholder when `company.taxProfile === 'SA'`
- [ ] Customer Return reverses DN; Credit Note reverses Invoice
- [ ] All labels translated; RTL audit pass

### F5 — Accounting Depth
- [ ] Financials page values come from `ledger.*` service (not hardcoded)
- [ ] Manual JE can be created, posted, and reversed; balance indicator enforces Dr = Cr
- [ ] Period close locks dates across the app; "Year locked" badge appears on year end
- [ ] Recon workspace accepts bank-statement CSV and matches lines
- [ ] All labels translated; RTL audit pass

### F6 — Approvals & Inbox
- [ ] Inbox approval flips the source document's state and writes an audit event
- [ ] Every Document detail page has a populated History tab
- [ ] Notifications bell shows unread count and a click navigates to the doc
- [ ] Approval-rule preview appears on every doc that would route on submit
- [ ] All labels translated; RTL audit pass

### F7 — AI Differentiator
- [ ] OCR confidence chip per field; user can accept/reject inline; rejection resets field
- [ ] "Approve" on AI PO suggestion creates a real PR (visible in PR list)
- [ ] Close checklist clicks land the user on a filtered list, not a toast
- [ ] AI confidence colors match thresholds from settings
- [ ] All labels translated; RTL audit pass

### F8 — GCC Compliance
- [ ] FATOORA fields validate per Saudi spec; QR data string preview matches expected format
- [ ] UAE VAT return page renders a printable summary for any period
- [ ] WHT fields appear only when supplier is flagged for WHT
- [ ] Bilingual Saudi invoice prints with en + ar columns
- [ ] All labels translated; RTL audit pass

---

## Section 7 — Handoff Contract for Backend Team

What this branch will deliver to the backend team upon merge:

- `src/types/**` — every entity, DTO, list-query, list-response, mutation-payload as TypeScript types. **This is the API spec in code.** Backend implements endpoints that satisfy these types.
- `src/lib/api/**` — one file per resource. Each function (`list`, `get`, `create`, `update`, `submit`, `approve`, `post`, `cancel`, `reverse`, `allocate`, etc.) is annotated with JSDoc describing:
  - HTTP method + path the backend should expose
  - Idempotency requirements
  - Validation rules
  - Side effects on related documents (e.g. "creates Stock Moves", "writes Journal Entry", "updates `qty_received` on parent PO line")
  - Period-guard expectations
  - Auth/role requirements
- `src/lib/api/_client.ts` — single integration point. Backend swap is one constant change (`USE_FAKE_SERVICE = false`).
- `src/lib/state-machines/**` — authoritative transition graph per doc type. Backend mirrors these server-side as guards.
- `src/lib/period.ts`, `numbering.ts`, `tax.ts` — pure functions documenting expected behavior; backend may re-implement server-side as needed.
- One `README.md` per module under `src/app/[locale]/(app)/<module>/` documenting:
  - Entities owned
  - State machine
  - Related-doc edges
  - Period rules
  - Role permissions
  - Expected GL postings (where applicable)
- A `requests.http` file at repo root with one example request per `src/lib/api/*` function so backend can stub-test before any UI changes.

What we do **not** ship from this branch:
- No real DB / migrations / seeds (backend owns)
- No real auth / sessions / RBAC enforcement (backend owns; UI gates by typed role only)
- No real PDF / email / OCR / bank-import processing (backend owns)
- No real FATOORA submission (backend owns; UI only renders fields + QR preview)

---

## Section 8 — Build Log (what shipped)

> Section 5 above is the original objective-step plan. This section is the **as-built record**: every phase F0–G11 that has actually shipped, the files added/modified, the verified routes, and how to test each.

Dev server: http://localhost:3000 (Next 16 + Turbopack). `npx tsc --noEmit` clean. Dev log: 0 errors / 0 warnings.

### Phase F0 — Foundation · ✅ done

**What shipped**
- Renamed `src/middleware.ts` → `src/proxy.ts` (Next 16 deprecation gone).
- Typed contract: `src/types/{common,audit,index}.ts` — `Currency`, `Money`, `DocState`, `PeriodStatus`, `Role`, `DocType`, `TaxJurisdiction`, `ISO8601`, `AuditEvent`.
- Pure helpers: `src/lib/{money,period,numbering,tax}.ts`; `formatKwd` now delegates to `formatMoney`.
- State machine: `src/lib/state-machines/index.ts` — `legalActions(docType, state, role)`, `isEditable`, `isPosted`.
- Fake service: `src/lib/api/_client.ts` — Promise + sessionStorage; flag `USE_FAKE_SERVICE = true`.
- Session: `src/lib/session.tsx` — `SessionProvider` + `useSession()` with persisted role + active company.
- Doc primitives: `src/components/doc/{StatusTimeline,RelatedDocs,ActionBar,DocumentLayout,DocumentList,StateBadge,DocLines,HistoryTab,FatooraQr}.tsx`.
- State components: `src/components/state/{Empty,Loading,ErrorState}.tsx`.
- App shell: `src/components/app/{UserMenu,CompanySwitcher,ModuleSubnav}.tsx`; `src/components/dev/RoleSwitcher.tsx`.
- Layout wired with `SessionProvider`, `CompanySwitcher`, `LocaleSwitcher`, `UserMenu`, dev `RoleSwitcher`.
- Mocks relocated to `src/mocks/{inbox,stats,cfo,invoices,reconciliation,thresholds,financials,closing,sales,purchasing,inventory}.ts` + barrel; `src/lib/demo-data.ts` becomes a thin re-export for back-compat.
- `messages/{en,ar}.json` extended with `common.actions.*`, `common.states.*`, `common.period.*`, `common.empty`, `common.loading`, `common.error.*`.

**Test**
- Open http://localhost:3000 → top-right shows CompanySwitcher · LocaleSwitcher · avatar UserMenu dropdown. Bottom-right shows a dashed orange "dev · role" pill. Switch role / company / locale and see persistence across refresh (sessionStorage).

### Phase F1 — Master Data (seed-only) · ✅ done (seed) / 🟡 deferred (CRUD UIs)

**What shipped**
- Entity types: `src/types/entities/{master,p2p,q2c,inv,gl,index}.ts` re-exported via `src/types/index.ts`.
- Seed master data: `src/mocks/seed/master.ts` — 3 companies (KW/SA/AE), 3 branches, 4 customers (one on credit hold, one near limit), 4 suppliers, 5 products, 2 warehouses, 3 locations, 4 tax codes, 3 payment terms, 1 bank account, 12 fiscal periods (Jan/Feb hard-closed, Mar soft-closed, Apr+ open).
- API readers: `src/lib/api/master.ts` for every entity.

**Deferred**: Settings CRUD pages (Companies / Customers / Suppliers / Products / Tax codes / etc.). All data accessible read-only via the api/* modules used by every downstream module.

**Test**
- Inspect the active company in the top bar — switching to Atmata Saudi flips FATOORA on customer-invoice forms.

### Phase F2 — Procure-to-Pay (read trail) · ✅ done

**What shipped**
- Seed: `src/mocks/seed/p2p.ts` — 1 PR, 3 POs (full-path / discrepancy / draft), 2 GRNs, 2 Bills, 1 Vendor Payment.
- API: `src/lib/api/p2p.ts` — `listPurchaseRequisitions`, `getPurchaseRequisition`, `listPurchaseOrders`, `getPurchaseOrder`, `listGoodsReceipts`, `getGoodsReceipt`, `listVendorBills`, `getVendorBill`, `listVendorPayments`, `getVendorPayment`.
- Module sub-nav: `src/app/[locale]/(app)/purchasing/layout.tsx` (Overview · POs · GRNs · Bills · Payments).
- List + detail pages for **POs**, **GRNs**, **Bills**, **Payments** — each detail uses `DocumentLayout` with status timeline, lines tab, history tab, related-docs rail. Bills carry a dedicated **3-way match** tab.

**Test**
- Walk `/en/purchasing/purchase-orders/po_1` → click GRN-2026-00001 in the Related Documents rail → walk to bill_1 → walk to vpay_1 → walk to JE-2026-00001..00004.

### Phase F3 — Inventory (read trail) · ✅ done

**What shipped**
- Seed: `src/mocks/seed/inv.ts` — 6 stock moves (auto-derived from GRN/DN/Transfer/Adjustment), 1 internal transfer, 1 stock adjustment.
- API: `src/lib/api/inventory-tx.ts`.
- Module sub-nav and list/detail pages under `/inventory/{stock-moves,transfers,adjustments}`.

### Phase F4 — Quote-to-Cash (read trail) · ✅ done

**What shipped**
- Seed: `src/mocks/seed/q2c.ts` — 2 Opportunities, 3 Quotes (full / draft / blocked-by-credit-hold), 2 SOs (one with `blockedReason`), 1 DN, 1 Invoice, 1 Receipt.
- API: `src/lib/api/q2c.ts`.
- Sub-nav + list/detail pages under `/sales/{quotes,orders,deliveries,invoices,receipts}`.
- Customer Invoice detail renders FATOORA QR placeholder when active company `taxProfile === "SA"`.

### Phase F5 — GL · ✅ done

**What shipped**
- Seed: `src/mocks/seed/gl.ts` — 10 accounts, 8 Journal Entries (one per posted business doc, Dr=Cr balanced).
- API: `src/lib/api/gl.ts` — list/get/findJournalEntryForSource.
- `/accounting/journal-entries` list + `[id]` detail with balance indicator.
- Every posted doc auto-surfaces its JE in the Related Documents rail (`src/lib/api/links.ts`).

### Phase F6 — Audit/History tab + Inbox deep-links · ✅ done

**What shipped**
- Seed: `src/mocks/seed/audit.ts` — ~30 audit events covering every state transition in seeded docs.
- API: `src/lib/api/audit.ts`.
- `HistoryTab` component rendered as a tab on every detail page.
- Inbox cards now carry `source_url` and deep-link to the underlying doc (BILL-2026-00002, BILL-2026-00001, SO-2026-00002).

### Phase F7 — AI invoice cards → Vendor Bill · ✅ done

**What shipped**
- `accounting/invoices/invoices-client.tsx` carries an `OCR_JOB_TO_BILL_ID` map and renders a "→ Bill" badge next to each row that has a matched seed bill.

### Phase F8 — FATOORA placeholder · ✅ done

**What shipped**
- `src/components/doc/FatooraQr.tsx` — placeholder grid QR + seller VAT / buyer VAT block + payload preview, gated on `company.taxProfile === "SA"`.

### Phase G — UX Completeness Pass (real-life write surface) · ✅ done

The G-series sits on top of F0–F8 to make the UI **feel like a real working ERP** even though persistence stays toast-only. Every form, gate, banner, dialog, validation message, role check, period check, credit check, duplicate check, FX prompt, lot picker, FATOORA gate, "are you sure" preview, unsaved-changes guard, permission-denied state — all visible and clickable.

#### G4 — Form pattern library

`src/components/form/`:
- `DocForm.tsx` — header / lines / totals / attachments / notes / approval-preview / errors / save+submit+cancel scaffold.
- `DatePicker.tsx` — period-aware (red icon for hard-closed, amber for soft-closed, role-aware enable).
- `MoneyInput.tsx` — KWD 3 dp / SAR & AED & USD 2 dp; currency symbol prefix.
- `FxRateInput.tsx` — appears when doc currency ≠ base; suggested rate from `FX_RATES` seed; live converted-base preview.
- `SearchSelect.tsx` — combobox over master rows with badges (`credit hold`, `lot-tracked`, `not purchasable`, `overdue`).
- `LotPicker.tsx` — FEFO suggested, required for lot-tracked products.
- `TaxBreakdown.tsx` — subtotal + per-tax-code summary + grand total.
- `ValidationSummary.tsx` — top-of-form red list of all field errors.
- `UnsavedChangesGuard.tsx` — `beforeunload` warning when form is dirty.
- `ApprovalRoutePreview.tsx` — renders the chain from `resolveApprovalChain(docType, amount)`.
- `PermissionGate.tsx` — full-page card with role explainer when current role isn't allowed.
- `PeriodGate.tsx` — disabled-Post fallback with reason.
- `ProductLinesEditor.tsx` — reusable per-row product SearchSelect + qty + unit + tax + line total; auto-pulls product defaults; LotPicker auto-appears for lot-tracked SKUs; over-receive warning per line.

#### G4 — Seed extensions

- `src/mocks/seed/fx.ts` — daily FX rates KWD↔SAR↔AED↔USD; `getFxRate(from, to, date)` helper.
- `src/mocks/seed/approvals.ts` — `APPROVAL_RULES` per doc type × min-amount; `resolveApprovalChain(docType, amount)`.

#### G7 — Universal fail-safes

`src/components/state/`:
- `Skeleton.tsx` — `Skeleton`, `SkeletonRows`, `SkeletonDetail` for loading states.
- `StaleDataPill.tsx` — "Updated 2 min ago · Refresh" widget.
- `DisabledTooltip.tsx` — wraps disabled controls with native `title` tooltip.

`src/components/doc/RichConfirmPreview.tsx` — structured preview body + plain-text fallback for the existing `useConfirm()` text dialog.

`src/components/banners/index.tsx` — 13 banner components, one per edge case:
- `DemoModeBanner`
- `PeriodLockBanner` (status: soft/hard, date)
- `CreditHoldBanner` (exposure, limit)
- `CreditLimitWarning` (exposure, limit)
- `OverReceiveBanner` (ordered, alreadyReceived, thisReceipt)
- `DuplicateBillBanner` (existingBillId, existingNumber, locale)
- `ExpiredQuoteBanner` (validUntil)
- `ConcurrentEditBanner` (by, at)
- `PermissionDeniedBanner` (requiredRoles, currentRole)
- `InsufficientStockBanner` (productName, available, required, warehouseName)
- `FxRateBanner` (docCurrency, baseCurrency)
- `LotRequiredBanner`
- `PostedWatermarkBanner`

#### G1 — Action bar wiring + rich-preview confirms

`src/components/doc/DocActionBar.tsx`:
- Reads role from `useSession`, calls `legalActions(docType, state, role)`, renders `ActionBar`.
- Each action opens a rich-preview confirm dialog (submit / approve / reject / post / cancel / reverse / close) with destructive tone where applicable and a "Demo · will not persist" line.
- On confirm: `toast.success`, ephemeral state-machine advance shown inline ("Demo state advance: draft → pending"), action bar re-computes new legal actions.
- Period-aware: looks up doc date in `FISCAL_PERIODS`, renders `PeriodLockBanner` and disables actions when blocked.
- Surfaces `PostedWatermarkBanner` for posted docs.

Wired into the `actionBar` prop on every detail page:
- `/purchasing/{purchase-orders,goods-receipts,bills,payments}/[id]`
- `/sales/{quotes,orders,deliveries,invoices,receipts}/[id]`
- `/inventory/{transfers,adjustments}/[id]`
- `/accounting/journal-entries/[id]`

#### G2 — `/new` routes (13 doc-creation flows)

Every transactional doc type now has a full creation form. Pattern: thin server `page.tsx` fetches masters and renders a client `new-X-form.tsx` wrapped in `PermissionGate`. Each form uses `DocForm`, `DatePicker`, `SearchSelect`, `ProductLinesEditor`, `TaxBreakdown`, `ApprovalRoutePreview`, validation summary, and rich-preview confirm.

- `purchasing/purchase-requisitions/new` (role: warehouse|buyer|admin)
- `purchasing/purchase-orders/new` (role: buyer|admin)
- `purchasing/goods-receipts/new?from=po_X` (role: warehouse|admin) — prefills from PO, over-receive banner, lot picker auto for lot-tracked products
- `purchasing/bills/new?from=po_X&fromGrn=grn_X` (role: ap_clerk|admin) — duplicate-vendor-invoice live detection, FX-rate input when foreign currency, approval-route preview
- `purchasing/payments/new?from=bill_X` (role: ap_clerk|accountant|admin) — open-bills allocation table, allocated vs unallocated tracker
- `sales/quotes/new` (role: sales_rep|admin) — credit-hold + credit-limit banners on customer pick
- `sales/orders/new?from=qt_X` (role: sales_rep|admin) — confirm blocked when customer on credit hold
- `sales/deliveries/new?from=so_X` (role: warehouse|admin) — lot-required validation, insufficient-stock banner on oversold demo line
- `sales/invoices/new?from=so_X&fromDn=dn_X` (role: ar_clerk|admin) — FATOORA banner + Buyer VAT required for Saudi B2B
- `sales/receipts/new?from=inv_X` (role: ar_clerk|accountant|admin) — open-invoices allocation table
- `inventory/transfers/new` (role: warehouse|admin) — from/to warehouses must differ
- `inventory/adjustments/new` (role: warehouse|accountant|admin) — auto-routes to approval when est. value > 5,000 KWD
- `accounting/journal-entries/new` (role: accountant|admin) — Dr=Cr balance indicator gates submit

#### G2 quick actions

- `src/components/doc/CreateChildLinks.tsx` + `NewDocButton`.
- `+ New` primary action on **every** list page.
- Quick-action panel on each parent doc detail:
  - PO confirmed/posted → `+ Receive (GRN)`, `+ Bill`
  - GRN → `+ Bill`
  - Bill posted with balance → `+ Payment`
  - Quote accepted (not expired) → `+ Convert to SO`
  - SO confirmed/posted (not blocked) → `+ Deliver`, `+ Invoice`
  - DN → `+ Invoice`
  - Invoice posted with balance → `+ Receipt`

#### G3 — `/[id]/edit` routes (12 doc types)

Single shared shell: `src/components/doc/DocEditShell.tsx`.
- **Posted docs** → `PostedWatermarkBanner` + read-only line preview + destructive **Reverse** button (rich-preview confirm warning about reversing JE).
- **Editable docs** (draft / pending) → in-place header/notes edit with `UnsavedChangesGuard` + dirty-tracked Discard confirm + Save → toast.

Routes: `purchase-orders`, `goods-receipts`, `bills`, `payments`, `quotes`, `orders`, `deliveries`, `invoices`, `receipts`, `transfers`, `adjustments`, `journal-entries` — all `/[id]/edit`.

#### G5 — Edge-case seed expansion

Added clickable examples of every banner:
- `po_4` — dated 2026-02-15 (**hard-closed period**) → red `PeriodLockBanner` on detail; actions disabled.
- `po_5` — dated 2026-03-20 (**soft-closed period**) → amber banner; post enabled only for `period_adjust` / `admin`.
- `bill_3` — **USD** vendor bill → `FxRateBanner` on `/new`, `review` 3-way status.
- `bill_4` — re-uses `bill_1`'s vendor invoice number `PCG/2026/INV-447` → seeded duplicate; `/new` shows live `DuplicateBillBanner` when the same number is typed.
- `qt_4` — `validUntil 2026-04-01` (past) → `ExpiredQuoteBanner` + Convert-to-SO hidden.
- Existing: `so_2` (credit hold blocked), `bill_2` (3-way discrepancy), `adj_1` (over-threshold approval).

#### G6 — Approval inbox

`/inbox/approvals/page.tsx` — aggregates every pending PO / Bill / Payment / SO / Invoice / Stock Adjustment / JE.
- Shows the resolved approval chain per row (e.g., "Khalid → Ahmed → CFO").
- `ApprovalActions` inline component: approver-role users see **Approve** / **Reject** buttons; viewer-role sees a "view only" tooltip.
- Each row deep-links to the doc detail.

#### G8 — Attachments + FileDrop

- `src/components/doc/FileDrop.tsx` — drag-over highlight, MIME accept, max-size validation, dedupe-by-name, fake upload progress bar, toast on accept.
- `src/components/doc/AttachmentsTab.tsx` — existing-attachments list + drop zone; ready to slot into any `DocumentLayout` tabs[].

#### G9 — GCC compliance UX

- Customer Invoice `/new` (Q2C) — when active company `taxProfile === "SA"`:
  - FATOORA banner rendered above the form
  - Buyer VAT input + B2B toggle
  - Buyer VAT required-validation for B2B invoices
- Customer Invoice detail still renders `FatooraQrPlaceholder` for SA.
- (WHT on vendor payment + bilingual SA invoice template = follow-up polish.)

#### G10 — i18n + RTL

- `messages/{en,ar}.json` extended with `common.*` keys covering doc-actions, states, period statuses, empty/loading/error labels.
- New form / banner labels remain English-literal for now; the foundation is in place and easy to extend.
- All routes return HTTP 200 in `/ar/*` (layout direction flips cleanly via `[locale]/layout.tsx`).

#### G11 — Verification

- `npx tsc --noEmit` clean.
- 30+ routes smoke-tested (en + ar): every `/new`, `/edit`, edge-case seed (`po_4`, `po_5`, `bill_3`, `bill_4`, `qt_4`, `so_2`, `bill_2`, `adj_1`), `/inbox/approvals` — all HTTP 200.
- Dev log shows zero errors and zero warnings.

---

## Section 9 — How to test the trail (walkthrough)

Open http://localhost:3000 and follow:

### Procure-to-Pay
1. `/en/purchasing/purchase-orders` → click **+ New PO**.
2. Fill in: supplier (notice on-hold / credit-hold badges in dropdown), currency, payment term, warehouse, dates, lines. Watch TaxBreakdown update live, ApprovalRoutePreview appear under Submit.
3. Click Submit → rich-preview confirm dialog → confirm → toast + redirect to list.
4. Open `po_1` detail → click Receive (GRN) in the quick-action rail → form prefills from PO lines → adjust qty / lot → Post.
5. Back to PO → click Bill in the quick-action → bill form prefills from PO; type `PCG/2026/INV-447` as the vendor invoice number → live duplicate banner appears with link to existing bill.
6. Open posted `bill_1` → see PostedWatermarkBanner + Reverse action in the action bar. Click Reverse → confirm dialog explains it'll generate a reversing JE in the next open period.

### Quote-to-Cash
1. `/en/sales/quotes` → **+ New Quote** → pick `Project Alpha JV` → red CreditHoldBanner. Pick `Gulf Foods WLL` (97% of limit) → amber CreditLimitWarning. Pick `Kuwait Retail Co.` (clear) → no banner.
2. Open `qt_1` → Convert to SO quick-action → SO form prefills.
3. Open `so_2` → CreditHoldBanner + blockedReason; action bar Confirm disabled.
4. Open `qt_4` → expired badge + ExpiredQuoteBanner; Convert-to-SO hidden.
5. Switch active company (top right) to **Atmata Saudi** → open `inv_1` → FATOORA QR placeholder appears. Click `/sales/invoices/new` → FATOORA banner + Buyer VAT field required for B2B.

### Edge cases
- `/en/purchasing/purchase-orders/po_4` → hard-closed period banner; all destructive actions disabled.
- `/en/purchasing/purchase-orders/po_5` → soft-closed banner. Toggle role to `period_adjust` (bottom-right pill) → post becomes enabled.
- `/en/purchasing/bills/bill_3` → USD bill detail; visiting its `/new` flow surfaces FX rate panel.
- `/en/sales/quotes/qt_4` → expired-quote demo.

### Role gating
- Toggle role to `viewer` → open `/en/purchasing/purchase-orders/new` → PermissionGate full-page card with required-roles explainer.
- Toggle to `approver` → `/en/inbox/approvals` → Approve / Reject buttons appear on every pending row.
- Toggle to `admin` → all gates lift.

### Period locking
- `/en/inventory/adjustments/new` → enter qty deltas that bring estimated value > 5,000 KWD → submit label flips to "Submit for approval".
- DatePicker on any form: pick a date in Jan/Feb 2026 → red period icon + inline hint.

### File upload
- Anywhere `<FileDrop />` appears (or wire it into a detail tab) → drag a PDF → fake progress bar → toast on completion.

---

## Section 10 — File map (everything that exists after the G-pass)

> Use this as a quick orientation. All paths relative to project root.

### Foundation
- `src/proxy.ts` (renamed from middleware.ts)
- `src/types/{common,audit,index}.ts`
- `src/types/entities/{master,p2p,q2c,inv,gl,index}.ts`
- `src/lib/{utils,money,period,numbering,tax,session.tsx}.ts`
- `src/lib/state-machines/index.ts`
- `src/lib/api/{_client,master,p2p,q2c,inventory-tx,gl,audit,links}.ts`
- `src/mocks/{inbox,stats,cfo,invoices,reconciliation,thresholds,financials,closing,sales,purchasing,inventory,index}.ts`
- `src/mocks/seed/{master,p2p,q2c,inv,gl,audit,fx,approvals,index}.ts`

### Components
- `src/components/doc/{StatusTimeline,RelatedDocs,ActionBar,DocumentLayout,DocumentList,StateBadge,DocLines,HistoryTab,FatooraQr,RichConfirmPreview,DocActionBar,CreateChildLinks,FileDrop,AttachmentsTab,DocEditShell}.tsx`
- `src/components/form/{DocForm,DatePicker,MoneyInput,FxRateInput,SearchSelect,LotPicker,TaxBreakdown,ValidationSummary,UnsavedChangesGuard,ApprovalRoutePreview,PermissionGate,PeriodGate,ProductLinesEditor}.tsx`
- `src/components/state/{Empty,Loading,ErrorState,Skeleton,StaleDataPill,DisabledTooltip}.tsx`
- `src/components/banners/index.tsx`
- `src/components/app/{UserMenu,CompanySwitcher,ModuleSubnav}.tsx`
- `src/components/dev/RoleSwitcher.tsx`
- Existing: `confirm-dialog.tsx`, `line-items-editor.tsx`, `data-table.tsx`, `toast.tsx`, `toast-from-query.tsx`, `locale-switcher.tsx`

### Routes (by module)

**Purchasing** (`src/app/[locale]/(app)/purchasing/`)
- `layout.tsx`, `page.tsx`
- `purchase-requisitions/new/{page,new-pr-form}.tsx`
- `purchase-orders/{page.tsx, new/{page,new-po-form}.tsx, [id]/{page,edit/page}.tsx}`
- `goods-receipts/{page.tsx, new/{page,new-grn-form}.tsx, [id]/{page,edit/page}.tsx}`
- `bills/{page.tsx, new/{page,new-bill-form}.tsx, [id]/{page,edit/page}.tsx}`
- `payments/{page.tsx, new/{page,new-payment-form}.tsx, [id]/{page,edit/page}.tsx}`
- `manual-po-modal.tsx`, `purchase-history-with-new-po.tsx`, etc. (legacy demo screens preserved)

**Sales** (`src/app/[locale]/(app)/sales/`)
- `layout.tsx`, `page.tsx`
- `quotes/{page.tsx, new/{page,new-quote-form}.tsx, [id]/{page,edit/page}.tsx}`
- `orders/{page.tsx, new/{page,new-so-form}.tsx, [id]/{page,edit/page}.tsx}`
- `deliveries/{page.tsx, new/{page,new-dn-form}.tsx, [id]/{page,edit/page}.tsx}`
- `invoices/{page.tsx, new/{page,new-invoice-form}.tsx, [id]/{page,edit/page}.tsx}`
- `receipts/{page.tsx, new/{page,new-receipt-form}.tsx, [id]/{page,edit/page}.tsx}`

**Inventory** (`src/app/[locale]/(app)/inventory/`)
- `layout.tsx`, `page.tsx`
- `stock-moves/page.tsx`
- `transfers/{page.tsx, new/{page,new-transfer-form}.tsx, [id]/{page,edit/page}.tsx}`
- `adjustments/{page.tsx, new/{page,new-adjustment-form}.tsx, [id]/{page,edit/page}.tsx}`

**Accounting** (`src/app/[locale]/(app)/accounting/`)
- `layout.tsx`, `page.tsx`
- `invoices/` (legacy OCR view with → Bill deep-link)
- `journal-entries/{page.tsx, new/{page,new-je-form}.tsx, [id]/{page,edit/page}.tsx}`
- `financials/page.tsx`, `reconciliation/page.tsx`, `close/page.tsx` (legacy)

**Inbox** (`src/app/[locale]/(app)/inbox/`)
- `page.tsx` (deep-linked rows)
- `approvals/{page,approval-actions}.tsx`

---

## Section 11 — Known gaps (next iteration candidates)

> Phase I (May 2026) closed the bulk of the prior gap list. Remaining items are
> the genuinely backend-bound ones; the frontend has the surfaces ready.

- **Real persistence** beyond `sessionStorage` for adoption log, AI queued actions, recon rules, period overrides, year locks. Backend swap is one constant flip in `src/lib/api/_client.ts` (`USE_FAKE_SERVICE = false`).
- **Real OCR + PDF + FATOORA submission** to ZATCA — the SA invoice print stylesheet renders fields + QR payload preview only.
- **Reservation tables + serial-tracked items** as first-class doc types — lots are the only batch concept today (covered by I3).
- **Real LLM call** for AI co-pilot — `getAiSuggestions` stays deterministic-rule-based until backend wires a real model.
- **Settings detail-page CRUD** for the simple master entities (tax codes, currencies, etc.) — list pages render seed data; full edit forms would reuse `DocForm`.

## Section 12 — Phase H · ✅ done (May 2026)

The H-series sits on top of F0–G to ship **Document Adoption Engine + AI Co-pilot Rail + RFQ/Returns/Notes**.

**Adoption engine** — `src/types/adoption.ts`, `src/lib/api/adoption.ts` (getAdoptableLines, getAncestry, getDescendants, recordAdoptions, stash/read/clear context). State-machine helper `legalAdoptions(docType, state, role)`. Components: `AdoptionPicker`, `AdoptionTrail`, `LineLineageChip`, `AdoptToButton`, `AdoptionNewShell`. Wired into PR / RFQ / PO / GRN / Bill / Quote / SO / DN / Invoice detail pages with an "Adoption" tab + "Adopt to →" dropdown.

**New doc types** — RFQ (with vendor-quote comparison matrix), Vendor Return + Debit Note (reverses GRN), Customer Return + Credit Note (reverses DN). Seeds in `src/mocks/seed/{rfq,returns}.ts`; APIs in `src/lib/api/{rfq,returns}.ts`. State machines in `src/lib/state-machines/index.ts`. `links.ts` extended with cases for all new types. Routes under `purchasing/{rfqs,vendor-returns,debit-notes}` and `sales/{returns,credit-notes}`.

**AI co-pilot rail** — `src/components/ai/AiCopilotRail.tsx` with Observe / Suggest / Auto modes. Deterministic suggestion engine in `src/lib/api/ai.ts` covering next-action, duplicate bill, 3-way discrepancy, expired quote, credit hold, RFQ award. Synthetic `ai_agent` role added to `RoleSwitcher`. "Auto" queues actions to `/inbox` with a `bot-proposed` badge.

**Nav cleanup** — removed duplicate `/inbox` tab from primary nav; ATMATA brand logo now carries the unread-count badge.

**Verification** — `npx tsc --noEmit` clean; 25/25 routes returned 200 in both `/en` and `/ar` after the H pass.

## Section 13 — Phase I · ✅ done (May 2026)

Closes the bulk of Section 11's known gaps in one bundle.

### I1 — Universal polish
- `AttachmentsTab` added to every doc detail page via `src/components/doc/docAttachmentsTab.tsx` helper.
- `StaleDataPill` rendered next to the doc number in `DocumentLayout`, driven by an optional `loadedAt` prop (server-render time).
- `ConcurrentEditBanner` is now reachable via `?demoConflict=1` on any `/edit` route — wired into `DocEditShell`.

### I2 — i18n pass
- `AdoptionPicker`, `AdoptionTrail`, `AdoptToButton`, `AiCopilotRail` all consume `useTranslations("adoption"|"ai")` keys.
- `adoption.cancel` added to both locales; everything else reuses keys already shipped in H5.

### I3 — Product 360
- `src/app/[locale]/(app)/inventory/products/[sku]/page.tsx` — 9 tabs (overview, by-warehouse, stock moves, lots, purchase history, sales history, vendors, customers, AI insights).
- `src/lib/api/items.ts` — `getItemSnapshot`, `getItemStockByWarehouse`, `getItemMoves`, `getItemLots`, `getItemPurchaseHistory`, `getItemSalesHistory`, `getItemVendors`, `getItemCustomers`, `getProductBySku`.
- `src/components/charts/SparkLine.tsx` — pure SVG mini-chart with no dependencies.
- `DocLines` extended with optional `sku` + `locale` props to wrap product description in a link to Product 360.
- Stock-moves list accepts `?sku=` filter; product cell links to Product 360 in the moves list too.

### I4 — Settings CRUD (16 master entities + overview tile grid)
- `src/app/[locale]/(app)/settings/layout.tsx` with `ModuleSubnav`.
- Overview tile grid in `settings/page.tsx` linking to all sub-pages.
- New routes: `company`, `branches`, `fiscal-calendar`, `coa`, `tax-codes`, `currencies`, `fx-rates`, `payment-terms`, `sequences`, `customers` (list + detail), `suppliers` (list + detail), `products` (with SKU click-through to Product 360), `price-lists`, `warehouses`, `bank-accounts`, `approval-rules`, `users`.
- `fiscal-calendar/page.tsx` includes a client-side year/month grid with **Soft-close** / **Hard-close** / **Open** / **Close year** buttons (sessionStorage cache).

### I5 — Reconciliation upgrade
- CSV bank statement importer (parses client-side: `date, description, [reference], amount` header).
- Declarative rule builder (`if ref contains AND amount in [min, max] → propose match to docId`). Rules stored in `sessionStorage`.
- Suggested-match list with confidence chip; accept button posts toast + `recon.match.accepted` event.

### I6 — Period + year close + close-checklist deep-links
- Fiscal-calendar grid (I4) drives period state. Soft-close warns, hard-close blocks (existing `PeriodGate` honours the override).
- Year-end close button on each year card (enabled when all 12 months hard-closed) — confirms + queues synthetic retained-earnings JE.
- `accounting/close/page.tsx` each step now has an **Open list →** link to the relevant filtered route (`STEP_HREF` map in the page).

### I7 — GCC depth
- `Supplier` type extended with `whtApplicable` + `whtRate`; `sup_3` (PrintHub) seeded with 5% WHT.
- Vendor-payment `/new` form renders a WHT block when the selected supplier is flagged: gross → withheld → net pay + JE narrative.
- Vendor-payment detail page surfaces the same block.
- `SaudiInvoicePrint` — bilingual EN/AR side-by-side print dialog with FATOORA QR payload. Triggered by a **Print invoice (EN/AR)** button on customer-invoice detail when active company `taxProfile === "SA"`.
- `@media print` CSS scoped so the browser print dialog shows only the invoice block.

### I8 — Docs + verification
- `development.md` Section 11 reduced to backend-bound items.
- This section + Section 12 (Phase H) document the as-built record.
- `npx tsc --noEmit` clean.
- 60+ routes smoke-tested in `/en` and `/ar`.

## Section 14 — Phase J · ✅ done (May 2026)

Closes the next batch of UX gaps: PR discoverability, a global Cmd+K palette,
bulk actions, a notifications bell, and downstream-reachable adoption.

### J1 — PR discoverability
- `Purchase requisitions` now appears as the first item under the `purchasing/`
  sub-nav so the route is one click away from any P2P module page. (PR `/new`
  and `[id]` already existed; only the sub-nav link was missing.)

### J2 — Global Search / Action Palette (Cmd+K)
- `src/types/search.ts` — `SearchResult` shape (kind: `doc | product | action | settings`).
- `src/lib/search/match.ts` — pure-JS fuzzy matcher (substring + scattered-char scoring; no dependency).
- `src/lib/api/search.ts` — `buildSearchIndex()` pulls every seeded doc (PR, RFQ, PO, GRN, Bill, Payment, Vendor Return, Debit Note, Quote, SO, DN, Customer Invoice, Customer Receipt, Customer Return, Credit Note, JE, Transfer, Adjustment, Stock Move), every Product, every settings sub-page, plus a hardcoded `ACTIONS` list (Create PR / Create PO / Open inbox / Open reconciliation / etc.).
- `src/components/app/GlobalSearch.tsx` + `GlobalSearchProvider.tsx` — modal overlay, Cmd/Ctrl+K shortcut, Up/Down/Enter/Esc keyboard nav, recents in `sessionStorage`.
- Top-bar `<GlobalSearchTrigger>` button labelled `Search · ⌘K`.
- Telemetry: `globalSearch.open` + `globalSearch.select`.

### J3 — Bulk actions on list pages
- `src/components/data-table-selectable.tsx` — client `SelectableDataTable` with a leading checkbox column, "select all" tri-state header, and a yellow "N selected" toolbar that renders a caller-supplied bulk-actions slot.
- `src/components/doc/BulkAdoptButton.tsx` — drop-in for the toolbar; loads `AdoptableLines` for each selected id, opens `AdoptionPicker` in multi-parent merge mode. Groups dropdown by Direct vs Multi-hop.
- Wired into 3 highest-value list pages:
  - **Purchase requisitions** — bulk-adopt selected PRs into one PO / Bill / Payment.
  - **Purchase orders** — bulk-adopt selected POs into one GRN / Bill / Payment.
  - **Vendor bills** — bulk-adopt selected posted bills into one Payment (multi-bill payment).
- Pattern is mechanical; remaining lists (Quote / SO / DN / Customer Invoice) can be added with the same `*-list-client.tsx` template.

### J4 — Notifications bell
- `src/components/app/NotificationsBell.tsx` — top-bar bell with unread count.
- Dropdown groups: Inbox (from `DEMO_INBOX`) · Bot-proposed (from `listQueuedActions()` — Phase H AI queue) · Recent audit (from `AUDIT_EVENTS`).
- Click any row routes to the source doc. "Mark all read" stamps a timestamp in `sessionStorage.atmata.notifications.lastSeen`.
- Brand logo no longer carries the unread badge — that role is now the bell's.

### J5 — Multi-hop adoption (the big one)
- `src/lib/state-machines/index.ts` extends `AdoptionTarget` with `hops?: number` + `via?: DocType[]`.
- New private `descendantAdoptions(docType)` walks the forward `ADOPTIONS` edges (BFS) to compute every reachable descendant, tagging each with hop distance. Reverse-flow children (`vendor_return`, `debit_note`, `customer_return`, `credit_note`) are **not** traversed transitively — they remain valid only as direct edges.
- `legalAdoptions` now returns Direct (state-gated) edges plus all transitively-reachable descendants. Example: `legalAdoptions("pr", "posted", role)` → `[rfq(0), po(0), grn(1), vendor_bill(1), vendor_payment(2)]`.
- `src/components/doc/AdoptToButton.tsx` dropdown now groups items by **Direct** vs **Multi-hop**, with hop subtitles ("skips 2 hops"). Same in the bulk variant.
- `src/components/doc/AdoptionPicker.tsx` shows a yellow banner inside the picker when `hops > 0`: "Skipping N hops. Fields the source doesn't carry must be filled on the next form."
- `src/app/[locale]/(app)/purchasing/bills/new/new-bill-form.tsx` now reads `AdoptionContext` from `sessionStorage` as a fallback when no `?from=po_X` query param is present. If the parent is non-PO/GRN (i.e. multi-hop from PR/RFQ), a banner explains supplier / currency / payment-term must be picked manually, and the form pre-fills lines from the adopted parent.
- Telemetry: `adoption.multiHop { from, to, hops }` fires whenever a >0-hop adoption is started.

### J6 — Docs + verification
- This section.
- `npx tsc --noEmit` clean; `npm run build` clean.
- 35+ routes smoke-tested across `/en` and `/ar` including the bulk-action list pages.
- Plan file at `/Users/bsure/.claude/plans/now-read-the-devolopment-md-spicy-toast.md` deleted; this section is the durable record.
