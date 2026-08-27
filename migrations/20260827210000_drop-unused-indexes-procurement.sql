-- Drop unused indexes (Procurement + Inventory + Warehouse batch).
-- Source batch list: /tmp/idx_batch_b.txt (76 index names in public schema).
--
-- FK-covering indexes SKIPPED (kept): these indexes were created by
-- migrations 20260820212431_fk-covering-indexes.sql and
-- 20260820212705_email-log-requested-by-fk-index.sql to cover FK
-- referencing columns (Postgres does not auto-index FK columns). Dropping
-- them would re-introduce the missing-fk-index advisor issue and slow down
-- FK cascades / joins. Kept — do not drop:
--   warehouses_company_id_branch_id_idx
--   stock_moves_company_id_warehouse_id_idx
--   stock_adjustment_lines_company_id_product_id_idx
--   stock_adjustment_lines_company_id_warehouse_id_idx
--   inventory_lots_company_id_warehouse_id_idx
--   internal_transfers_company_id_from_warehouse_id_idx
--   internal_transfers_company_id_to_warehouse_id_idx
--   internal_transfer_lines_company_id_product_id_idx
--   vendor_return_lines_company_id_tax_code_id_idx
--   vendor_return_lines_company_id_product_id_idx
--   vendor_return_lines_company_id_grn_line_id_idx
--   vendor_returns_company_id_grn_id_idx
--   vendor_returns_company_id_warehouse_id_idx
--   vendor_returns_company_id_supplier_id_idx
--   vendor_returns_company_id_debit_note_id_idx
--   vendor_payments_company_id_currency_idx
--   vendor_payments_company_id_supplier_id_idx
--   vendor_payments_company_id_bank_account_id_idx
--   vendor_payment_allocations_company_id_bill_id_idx
--   vendor_bills_company_id_currency_idx
--   vendor_bills_company_id_grn_id_idx
--   vendor_bills_company_id_po_id_idx
--   vendor_bill_lines_company_id_product_id_idx
--   vendor_bill_lines_company_id_tax_code_id_idx
--   vendor_bill_lines_company_id_po_line_id_idx
--   vendor_bill_lines_company_id_grn_line_id_idx
--   purchase_orders_company_id_pr_id_idx
--   purchase_orders_company_id_warehouse_id_idx
--   purchase_orders_company_id_currency_idx
--   purchase_orders_company_id_supplier_id_idx
--   purchase_orders_company_id_payment_term_id_idx
--   purchase_order_lines_company_id_tax_code_id_idx
--   purchase_requisition_lines_company_id_product_id_idx
--   purchase_requisition_lines_company_id_tax_code_id_idx
--   rfqs_company_id_award_po_id_idx
--   rfqs_company_id_awarded_vendor_id_idx
--   rfqs_company_id_awarded_quote_id_idx
--   rfq_lines_company_id_product_id_idx
--   rfq_invited_suppliers_company_id_supplier_id_idx
--   rfq_quotes_company_id_currency_idx
--   rfq_quotes_company_id_vendor_id_idx
--   rfq_quote_lines_company_id_rfq_line_id_idx
--   rfq_sources_company_id_purchase_requisition_id_idx
--   goods_receipts_company_id_po_id_idx
--   goods_receipts_company_id_supplier_id_idx
--   goods_receipts_company_id_warehouse_id_idx
--   goods_receipt_lines_company_id_tax_code_id_idx
--   goods_receipt_lines_company_id_po_line_id_idx
--   goods_receipt_lines_company_id_product_id_idx
--   debit_notes_company_id_vendor_return_id_idx
--   debit_notes_company_id_bill_id_idx
--   debit_notes_company_id_currency_idx
--   debit_notes_company_id_supplier_id_idx
--
-- NOTE on CONCURRENTLY: InsForge applies each migration inside its own
-- transaction (see references/database/migrations.md). DROP INDEX
-- CONCURRENTLY cannot run inside a transaction block
-- (https://www.postgresql.org/docs/current/sql-dropindex.html), so plain
-- DROP INDEX IF EXISTS is used here. None of the dropped indexes back a
-- constraint (verified via pg_constraint), so plain DROP is safe.

-- stock_moves
DROP INDEX IF EXISTS public.stock_moves_search_simple_gin_idx;
DROP INDEX IF EXISTS public.stock_moves_item_history_idx;
DROP INDEX IF EXISTS public.stock_moves_company_id_idx;

-- stock_adjustments
DROP INDEX IF EXISTS public.stock_adjustments_company_id_idx;
DROP INDEX IF EXISTS public.stock_adjustments_search_simple_gin_idx;

-- stock_adjustment_lines
DROP INDEX IF EXISTS public.stock_adjustment_lines_company_id_idx;

-- internal_transfers
DROP INDEX IF EXISTS public.internal_transfers_search_simple_gin_idx;

-- internal_transfer_lines
DROP INDEX IF EXISTS public.internal_transfer_lines_company_id_idx;

-- vendor_return_lines
DROP INDEX IF EXISTS public.vendor_return_lines_company_id_idx;

-- vendor_returns
DROP INDEX IF EXISTS public.vendor_returns_search_simple_gin_idx;

-- vendor_payments
DROP INDEX IF EXISTS public.vendor_payments_search_simple_gin_idx;

-- vendor_bills
DROP INDEX IF EXISTS public.vendor_bills_search_simple_gin_idx;

-- purchase_orders
DROP INDEX IF EXISTS public.purchase_orders_search_simple_gin_idx;

-- purchase_order_lines
DROP INDEX IF EXISTS public.purchase_order_lines_item_idx;

-- purchase_requisitions
DROP INDEX IF EXISTS public.purchase_requisitions_company_id_idx;
DROP INDEX IF EXISTS public.purchase_requisitions_search_simple_gin_idx;

-- rfqs
DROP INDEX IF EXISTS public.rfqs_search_simple_gin_idx;

-- rfq_lines
DROP INDEX IF EXISTS public.rfq_lines_company_id_idx;

-- rfq_quote_lines
DROP INDEX IF EXISTS public.rfq_quote_lines_company_id_idx;

-- rfq_line_sources
DROP INDEX IF EXISTS public.rfq_line_sources_pr_line_idx;
DROP INDEX IF EXISTS public.rfq_line_sources_company_id_idx;
DROP INDEX IF EXISTS public.rfq_line_sources_rfq_line_idx;

-- goods_receipts
DROP INDEX IF EXISTS public.goods_receipts_search_simple_gin_idx;

-- debit_notes
DROP INDEX IF EXISTS public.debit_notes_search_simple_gin_idx;
