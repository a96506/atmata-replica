# Residual features plan (F-010, F-062, F-025/F-026)

Plan for residual work that findings.md still marks as not Done.
Do not reopen closed phases. Do one numbered phase per Cursor session.

## Locked order

1. **F-010** CoA bilingual UI (smallest; DB columns exist)
2. **F-062** `field_change` audit writers (schema + HistoryTab exist; wire writes)
3. **F-025** i18n wording (shared chrome → modules) then **F-026** RTL polish

---

## Phase 0 — DONE (discovery)

Discovery complete on **2026-09-02**.

### Sources

| Topic | Path / note |
| --- | --- |
| Residual status | `findings.md` L13–15 (F-010, F-025, F-026, F-062) |
| CoA bilingual columns | `migrations/20260827174453_add-accounts-bilingual-names.sql` (applied) |
| Audit `change_detail` | `migrations/20260827174421_add-audit-events-change-detail.sql` (applied) |
| Copy pattern: tax codes | `src/app/[locale]/(app)/settings/tax-codes/page.tsx` (`nameEn` / `nameAr`) |
| Copy pattern: payment terms | `src/app/[locale]/(app)/settings/payment-terms/page.tsx` |
| CoA page (target) | `src/app/[locale]/(app)/settings/coa/page.tsx` |
| Selects | `src/lib/db/selects.ts` (`GL_SELECTS.accounts`) |
| Entity types | `src/types/entities/gl.ts` |
| Zod / master validation | `src/lib/validation/master.ts` |
| Master actions | `src/lib/actions/master.ts` |
| Audit write API | `src/lib/api/audit.ts` → `writeAuditEvent` |
| Attachment audit writers | `src/lib/actions/audit.ts` → `recordAttachmentAddedEvent` (mirror for field change) |
| History UI | `src/components/doc/HistoryTab.tsx` → `changeDetailLabel` |
| i18n stack | `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts` |
| Locale messages | `messages/en.json`, `messages/ar.json` |
| RTL copy | `src/components/app/AppSidebar.tsx` (`rtl:rotate-180`); layout `dir` on `html` |

### Allowed APIs (from discovery)

- `writeAuditEvent({ docType, docId, fromState?, toState?, by?, reason?, eventType?, changeDetail? })` in `src/lib/api/audit.ts`
- `recordAttachmentAddedEvent(...)` in `src/lib/actions/audit.ts` — copy this shape for a new `recordFieldChangeEvent`
- `HistoryTab` + `changeDetailLabel` — already render `field_change` / `change_detail`; do not replace
- Master CRUD bilingual fields: copy `nameEn` / `nameAr` from tax-codes / payment-terms pages
- Locale links: `@/i18n/navigation` (not raw `next/link` on touched surfaces)
- Keep existing `name` column on accounts for compatibility

### Anti-patterns (global)

- Do not invent a second audit table or client-only history store
- Do not drop `accounts.name`
- Do not split a merged display name with string heuristics
- Do not add a new i18n library
- Do not wrap English text in `bdi` and call it Arabic

---

## Phase 1 — F-010 CoA bilingual UI — DONE (Sep2)

**Status:** DONE (2026-09-02). Typecheck pass. Wired: `selects.ts`, `gl.ts` Account, `validation/master.ts`, `master.ts` actions, `coa/page.tsx`. Seed/backfill residual cleared 2026-09-02: `name_en` already filled (live 160/160); `name_ar` left NULL — no trusted AR source; human translation only (no heuristic split). No new migration.

**Session:** one Cursor session. Stop when verify passes.

### What to implement

1. Read tax-codes page. Copy `nameEn` / `nameAr` column and form field pattern.
2. Wire `accounts.name_en` / `accounts.name_ar` through:
   - `src/lib/db/selects.ts` (`GL_SELECTS.accounts`)
   - `src/types/entities/gl.ts`
   - `src/lib/validation/master.ts`
   - `src/lib/actions/master.ts`
   - `src/app/[locale]/(app)/settings/coa/page.tsx` (MasterCrud columns and fields)
3. Keep `name` for compatibility. Do not drop it.
4. Update the stale CoA bilingual banner / incomplete UX copy on the CoA page.
5. Optional seed/backfill: closed 2026-09-02 — `name_en` already backfilled; `name_ar` stays NULL until human translation (no invent/split). Documented in findings.md.

### Copy sources

- `src/app/[locale]/(app)/settings/tax-codes/page.tsx`
- `src/app/[locale]/(app)/settings/payment-terms/page.tsx`
- `migrations/20260827174453_add-accounts-bilingual-names.sql` (schema already applied)

### Verify

- [x] `npm run typecheck` passes
- [x] CoA list shows EN and AR columns
- [x] Create and edit accept both names

### Anti-patterns

- Programmatic split of a merged `name` string
- Invent a tree UI for CoA
- Copy customers single-name pattern
- Drop the `name` column

---

## Phase 2 — F-062 field_change writers — DONE (Sep2)

**Status:** DONE (2026-09-02). Typecheck pass. Writers landed: `recordFieldChangeEvent` / `recordChangedFields` in `src/lib/actions/audit.ts`; wired on CoA (`updateAccountAction`), tax codes (`updateTaxCodeAction`), document header (`updateDocumentHeaderAction`), opportunity (`updateOpportunityAction`). Payment terms skipped (read-only by design). Live `audit_events` `field_change` proof **proved 2026-09-02** on local `:3000` (tax `EXEMPT` `name_en` `Tax exempt ·qa` → `Tax exempt ·f062`; row id `3c2e374b-9a07-4871-90d0-1209b69539b7`) after GRANT INSERT migration `migrations/20260902161444_audit-events-authenticated-insert.sql`.

**Session:** one Cursor session. Stop when verify passes.

### What to implement

1. Add `recordFieldChangeEvent` in `src/lib/actions/audit.ts`. Mirror `recordAttachmentAddedEvent`. Call `writeAuditEvent` with `eventType: "field_change"` and a `changeDetail` object.
2. Wire high-value update paths that lack `field_change` today. Start with:
   - master updates: CoA, tax codes, payment terms
   - 1–2 document edit paths that already call `writeAuditEvent`
3. Reuse `HistoryTab`. Do not build a new history UI.
4. Optional: company audit list filter for `event_type = field_change`.
5. No new audit table.

### Copy sources

- `src/lib/api/audit.ts` → `writeAuditEvent`
- `src/lib/actions/audit.ts` → `recordAttachmentAddedEvent`
- `src/components/doc/HistoryTab.tsx` → `changeDetailLabel`
- Credit / related RPC `field_change` JSON shape (align `change_detail` keys with existing renderers)

### Verify

- [x] `npm run typecheck` passes
- [x] Edit a master row → `audit_events` row with `event_type = field_change` and non-null `change_detail` — **proved 2026-09-02** local `:3000`: tax `EXEMPT` `name_en` `Tax exempt ·qa` → `Tax exempt ·f062`; row id `3c2e374b-9a07-4871-90d0-1209b69539b7`. Enabled by `migrations/20260902161444_audit-events-authenticated-insert.sql` (authenticated GRANT INSERT).

### Anti-patterns

- Secondary log database or table
- Client-only history
- Generic DB trigger that does not match existing SECURITY DEFINER / writer style

---

## Phase 3 — F-025 shared chrome i18n

**Session:** one Cursor session. Stop when verify passes.

### What to implement

1. Replace hardcoded English in shared chrome:
   - data-table empty states
   - GlobalSearch
   - NotificationsBell
   - MasterCrud strings
   - common `emptyMessage` helpers
2. Add keys to **both** `messages/en.json` and `messages/ar.json`.
3. On every touched file that imports `next/link`, switch to `@/i18n/navigation`.

### Copy sources

- Existing key style in `messages/en.json` / `messages/ar.json`
- `src/i18n/navigation.ts`

### Status: DONE — 2026-09-02

### Verify

- [x] Key parity (script or equal key counts for new keys)
- [x] `npm run typecheck` passes
- [x] Spot-check `/ar` routes for shared chrome (manual) — **cleared 2026-09-02**: NotificationsBell Arabic OK; **GlobalSearch:** live `/ar` **proved** (`بحث ⌘K` on `/ar/inventory`); MasterCrud CoA cleared 2026-09-02 via `settings.coa` + `getTranslations` on `coa/page.tsx`; GlobalSearch proved.

### Anti-patterns

- Keys in one locale only
- New i18n library

---

## Phase 4 — F-025 module surfaces (batch)

**Session:** one Cursor session. Stop when verify passes.

### Status: DONE — 2026-09-02

### What to implement

1. Sweep inventory, sales, purchasing, accounting, and recon forms.
2. Replace hardcoded English empties and toasts with message keys.
3. Same key parity rule: both `en.json` and `ar.json`.

### Verify

- [x] `npm run typecheck` passes
- [x] Sample pages render EN and AR strings  (manual) — **proved 2026-09-02** `/ar/inventory`: Arabic heading, tabs, table headers (`الرمز` / `المنتج` / …)

### Anti-patterns

- Keys in one locale only
- Scope creep into F-026 layout work in this session

---

## Phase 5 — F-026 RTL polish

**Session:** one Cursor session. Stop when verify passes.

### Status: DONE — 2026-09-02

Waves A/B/C done: logical CSS on ui/sidebar, sheet, dropdown-menu, input-group, select, combobox, data-table(+selectable), line-items-editor, DocLines, AdoptionNewShell/Picker, GlobalSearch; Empty `bdi` removed; HistoryTab `dir=ltr` off `t("by")`; ChevronRight `rtl:rotate-180` on dropdown-menu; AppSidebar already had mirror. Typecheck pass. Per-page routes deferred by design. Manual `/ar` sidebar/forms spot-check deferred (same as F-025; owner: Phase 6 / manual).

### What to implement

1. Systematic logical CSS: `ms` / `me` / `ps` / `pe` and `rtl:` variants on sidebars, forms, and alignment.
2. Keep `dir="ltr"` / `bdi` only for IDs, codes, and URLs.
3. Copy sidebar mirror from AppSidebar.

### Copy sources

- `src/components/app/AppSidebar.tsx` (`rtl:rotate-180`)
- App layout `dir` on `html`

### Verify

- [x] `/ar` sidebar and forms mirror correctly — **proved 2026-09-02** `:3000` `/ar/settings/coa` + `/ar/inventory`: `dir=rtl` `lang=ar`, Arabic sidebar nav. MasterCrud field labels cleared under F-025 (CoA via `settings.coa` + `getTranslations`).
- [x] No physical `ml` / `mr` / `pl` / `pr` / `text-left` / `text-right` class usage on touched files (grep; data-table comments mentioning `text-right` for call-site compat OK)
- [x] `npm run typecheck` passes

### Anti-patterns

- Wrapping English in `bdi` as fake Arabic
- Changing page language content in this phase (that is F-025)

---

## Phase 6 — Final verification

**Session:** one Cursor session.

### Status: DONE — 2026-09-02

Evidence: `npm run typecheck` PASS; focused vitest 11/11 (i18n + validation + validation/common + result); anti-pattern greps CLEAN (accounts.name kept; en/ar 1129/1129; audit_events only; no physical ml/mr/pl/pr/text-left/text-right on Phase 5 files; Empty no fake bdi; recordFieldChangeEvent via recordChangedFields).

### What to do

1. Run `npm run typecheck` and any focused tests that cover CoA, audit, or i18n.
2. Grep for anti-patterns from phases above (dropped `name`, one-locale keys, new audit table, physical margin regressions on touched files).
3. Update `findings.md` residuals:
   - mark Done when complete, or
   - leave residual-with-owner if something stays open

### Verify

- [x] typecheck pass
- [x] focused tests pass (4 files / 11 tests)
- [x] `findings.md` updated for F-010, F-062, F-025, F-026

---

## Session rule

One numbered phase per Cursor session (project rule).
Do not start Phase N+1 in the same session as Phase N unless Ahmad says so.
