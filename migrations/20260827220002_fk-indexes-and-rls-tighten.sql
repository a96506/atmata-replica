-- Composite indexes for foreign keys flagged by the advisor (missing-fk-index warnings).
-- InsForge wraps each migration in a transaction, so CREATE INDEX CONCURRENTLY
-- cannot be used (PostgreSQL: SQLSTATE 25001 — "CREATE INDEX CONCURRENTLY cannot
-- run inside a transaction block"). Plain CREATE INDEX IF NOT EXISTS is used
-- instead: it is allowed inside a transaction and takes only a brief lock on
-- these tables. See https://thesev1database.com/errors/msg-create-index-concurrently-cannot-run-inside-a-transaction-block/

CREATE INDEX IF NOT EXISTS stock_moves_company_id_product_id_idx
  ON public.stock_moves (company_id, product_id);

CREATE INDEX IF NOT EXISTS rfq_line_sources_company_id_purchase_requisition_line_id_idx
  ON public.rfq_line_sources (company_id, purchase_requisition_line_id);

CREATE INDEX IF NOT EXISTS customer_invoice_lines_company_id_product_id_idx
  ON public.customer_invoice_lines (company_id, product_id);

CREATE INDEX IF NOT EXISTS sales_order_lines_company_id_product_id_idx
  ON public.sales_order_lines (company_id, product_id);

CREATE INDEX IF NOT EXISTS purchase_order_lines_company_id_product_id_idx
  ON public.purchase_order_lines (company_id, product_id);

-- doc_state_transitions RLS:
-- The advisor flagged the SELECT policy `doc_state_transitions_select` as
-- permissive (unrestricted / always-true). Inspection confirms the table has
-- no tenant-ownership columns (columns: id, doc_type, from_state, action,
-- to_state, roles) and no INSERT/UPDATE/DELETE policies exist — it is
-- intentionally read-only. It is a shared legal state-machine reference
-- table, so the permissive SELECT is acceptable: RLS still restricts writes
-- (none are permitted by policy) and reads are intentionally public to all
-- authenticated tenants. Leaving the policy permissive on purpose.

COMMENT ON POLICY doc_state_transitions_select ON public.doc_state_transitions IS
  'Intentional — shared legal reference table, no tenant ownership columns. Read-only (no INSERT/UPDATE/DELETE policies). Permissive SELECT is acceptable.';
