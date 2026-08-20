-- Hygiene: covering indexes for FK referencing columns (missing-fk-index advisor).
-- Postgres does not auto-index FK referencing columns:
--   https://monpg.app/blog/postgresql-foreign-key-indexes
-- CREATE INDEX: https://www.postgresql.org/docs/current/sql-createindex.html
--
-- InsForge applies each migration inside a transaction, so CREATE INDEX
-- CONCURRENTLY cannot be used here (not allowed in a transaction).
-- Ops note for zero-downtime on a busy prod DB: apply equivalent indexes
-- outside a migration with CREATE INDEX CONCURRENTLY IF NOT EXISTS, then
-- record/no-op this migration. See:
--   https://mvpfactory.io/blog/zero-downtime-postgresql-migrations-in-production-advisory-locks-ghost-tables/
--
-- Generated from diagnose advisor missing-fk-index (139 indexes).
-- Leading-column coverage: advisor already excluded FKs with a covering index.

-- public.rfq_quote_lines.rfq_quote_lines_company_id_rfq_line_id_fkey
CREATE INDEX IF NOT EXISTS rfq_quote_lines_company_id_rfq_line_id_idx ON public.rfq_quote_lines (company_id, rfq_line_id);

-- public.customer_returns.customer_returns_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS customer_returns_company_id_warehouse_id_idx ON public.customer_returns (company_id, warehouse_id);

-- public.suppliers.suppliers_company_id_payment_term_id_fkey
CREATE INDEX IF NOT EXISTS suppliers_company_id_payment_term_id_idx ON public.suppliers (company_id, payment_term_id);

-- public.purchase_requisition_lines.purchase_requisition_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS purchase_requisition_lines_company_id_tax_code_id_idx ON public.purchase_requisition_lines (company_id, tax_code_id);

-- public.customer_receipts.customer_receipts_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS customer_receipts_company_id_currency_idx ON public.customer_receipts (company_id, currency);

-- public.credit_notes.credit_notes_company_id_invoice_id_fkey
CREATE INDEX IF NOT EXISTS credit_notes_company_id_invoice_id_idx ON public.credit_notes (company_id, invoice_id);

-- public.delivery_notes.delivery_notes_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS delivery_notes_company_id_warehouse_id_idx ON public.delivery_notes (company_id, warehouse_id);

-- public.write_commands.write_commands_actor_user_id_fkey
CREATE INDEX IF NOT EXISTS write_commands_actor_user_id_idx ON public.write_commands (actor_user_id);

-- public.customer_receipts.customer_receipts_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS customer_receipts_company_id_customer_id_idx ON public.customer_receipts (company_id, customer_id);

-- public.purchase_orders.purchase_orders_company_id_pr_id_fkey
CREATE INDEX IF NOT EXISTS purchase_orders_company_id_pr_id_idx ON public.purchase_orders (company_id, pr_id);

-- public.sales_orders.sales_orders_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS sales_orders_company_id_currency_idx ON public.sales_orders (company_id, currency);

-- public.rfqs.rfqs_award_po_fk
CREATE INDEX IF NOT EXISTS rfqs_company_id_award_po_id_idx ON public.rfqs (company_id, award_po_id);

-- public.purchase_orders.purchase_orders_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS purchase_orders_company_id_warehouse_id_idx ON public.purchase_orders (company_id, warehouse_id);

-- public.debit_notes.debit_notes_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS debit_notes_company_id_currency_idx ON public.debit_notes (company_id, currency);

-- public.purchase_orders.purchase_orders_company_id_payment_term_id_fkey
CREATE INDEX IF NOT EXISTS purchase_orders_company_id_payment_term_id_idx ON public.purchase_orders (company_id, payment_term_id);

-- public.vendor_payment_allocations.vendor_payment_allocations_company_id_bill_id_fkey
CREATE INDEX IF NOT EXISTS vendor_payment_allocations_company_id_bill_id_idx ON public.vendor_payment_allocations (company_id, bill_id);

-- public.ai_suggestions.ai_suggestions_created_by_fkey
CREATE INDEX IF NOT EXISTS ai_suggestions_created_by_idx ON public.ai_suggestions (created_by);

-- public.quotes.quotes_company_id_opportunity_id_fkey
CREATE INDEX IF NOT EXISTS quotes_company_id_opportunity_id_idx ON public.quotes (company_id, opportunity_id);

-- public.invitations.invitations_accepted_by_fkey
CREATE INDEX IF NOT EXISTS invitations_accepted_by_idx ON public.invitations (accepted_by);

-- public.fx_rates.fx_rates_company_id_quote_currency_fkey
CREATE INDEX IF NOT EXISTS fx_rates_company_id_quote_currency_idx ON public.fx_rates (company_id, quote_currency);

-- public.rfq_invited_suppliers.rfq_invited_suppliers_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS rfq_invited_suppliers_company_id_supplier_id_idx ON public.rfq_invited_suppliers (company_id, supplier_id);

-- public.customer_receipt_allocations.customer_receipt_allocations_company_id_invoice_id_fkey
CREATE INDEX IF NOT EXISTS customer_receipt_allocations_company_id_invoice_id_idx ON public.customer_receipt_allocations (company_id, invoice_id);

-- public.rfq_lines.rfq_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS rfq_lines_company_id_product_id_idx ON public.rfq_lines (company_id, product_id);

-- public.asset_depreciation_entries.asset_depreciation_entries_company_id_journal_entry_id_fkey
CREATE INDEX IF NOT EXISTS asset_depreciation_entries_company_id_journal_entry_id_idx ON public.asset_depreciation_entries (company_id, journal_entry_id);

-- public.stock_adjustment_lines.stock_adjustment_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS stock_adjustment_lines_company_id_product_id_idx ON public.stock_adjustment_lines (company_id, product_id);

-- public.customer_invoices.customer_invoices_company_id_dn_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoices_company_id_dn_id_idx ON public.customer_invoices (company_id, dn_id);

-- public.reconciliation_matches.reconciliation_matches_company_id_reconciliation_session_i_fkey
CREATE INDEX IF NOT EXISTS reconciliation_matches_company_id_reconciliation_session_id_idx ON public.reconciliation_matches (company_id, reconciliation_session_id);

-- public.rfqs.rfqs_awarded_quote_fk
CREATE INDEX IF NOT EXISTS rfqs_company_id_awarded_quote_id_idx ON public.rfqs (company_id, awarded_quote_id);

-- public.period_close_tasks.period_close_tasks_assigned_to_fkey
CREATE INDEX IF NOT EXISTS period_close_tasks_assigned_to_idx ON public.period_close_tasks (assigned_to);

-- public.reconciliation_sessions.reconciliation_sessions_started_by_fkey
CREATE INDEX IF NOT EXISTS reconciliation_sessions_started_by_idx ON public.reconciliation_sessions (started_by);

-- public.vendor_bill_lines.vendor_bill_lines_company_id_po_line_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bill_lines_company_id_po_line_id_idx ON public.vendor_bill_lines (company_id, po_line_id);

-- public.vendor_payments.vendor_payments_company_id_bank_account_id_fkey
CREATE INDEX IF NOT EXISTS vendor_payments_company_id_bank_account_id_idx ON public.vendor_payments (company_id, bank_account_id);

-- public.debit_notes.debit_notes_company_id_vendor_return_id_fkey
CREATE INDEX IF NOT EXISTS debit_notes_company_id_vendor_return_id_idx ON public.debit_notes (company_id, vendor_return_id);

-- public.rfq_sources.rfq_sources_company_id_purchase_requisition_id_fkey
CREATE INDEX IF NOT EXISTS rfq_sources_company_id_purchase_requisition_id_idx ON public.rfq_sources (company_id, purchase_requisition_id);

-- public.price_list_items.price_list_items_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS price_list_items_company_id_product_id_idx ON public.price_list_items (company_id, product_id);

-- public.invitations.invitations_invited_by_fkey
CREATE INDEX IF NOT EXISTS invitations_invited_by_idx ON public.invitations (invited_by);

-- public.bank_accounts.bank_accounts_company_account_fk
CREATE INDEX IF NOT EXISTS bank_accounts_company_id_account_id_idx ON public.bank_accounts (company_id, account_id);

-- public.purchase_orders.purchase_orders_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS purchase_orders_company_id_currency_idx ON public.purchase_orders (company_id, currency);

-- public.quotes.quotes_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS quotes_company_id_customer_id_idx ON public.quotes (company_id, customer_id);

-- public.products.products_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS products_company_id_tax_code_id_idx ON public.products (company_id, tax_code_id);

-- public.vendor_return_lines.vendor_return_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS vendor_return_lines_company_id_tax_code_id_idx ON public.vendor_return_lines (company_id, tax_code_id);

-- public.vendor_bill_lines.vendor_bill_lines_company_id_grn_line_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bill_lines_company_id_grn_line_id_idx ON public.vendor_bill_lines (company_id, grn_line_id);

-- public.customer_invoices.customer_invoices_company_id_so_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoices_company_id_so_id_idx ON public.customer_invoices (company_id, so_id);

-- public.goods_receipts.goods_receipts_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipts_company_id_supplier_id_idx ON public.goods_receipts (company_id, supplier_id);

-- public.vendor_returns.vendor_returns_debit_note_fk
CREATE INDEX IF NOT EXISTS vendor_returns_company_id_debit_note_id_idx ON public.vendor_returns (company_id, debit_note_id);

-- public.approval_decisions.approval_decisions_decided_by_fkey
CREATE INDEX IF NOT EXISTS approval_decisions_decided_by_idx ON public.approval_decisions (decided_by);

-- public.goods_receipt_lines.goods_receipt_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipt_lines_company_id_product_id_idx ON public.goods_receipt_lines (company_id, product_id);

-- public.approval_requests.approval_requests_requested_by_fkey
CREATE INDEX IF NOT EXISTS approval_requests_requested_by_idx ON public.approval_requests (requested_by);

-- public.bank_statements.bank_statements_imported_by_fkey
CREATE INDEX IF NOT EXISTS bank_statements_imported_by_idx ON public.bank_statements (imported_by);

-- public.reconciliation_matches.reconciliation_matches_company_id_rule_id_fkey
CREATE INDEX IF NOT EXISTS reconciliation_matches_company_id_rule_id_idx ON public.reconciliation_matches (company_id, rule_id);

-- public.approval_requests.approval_requests_resolved_by_fkey
CREATE INDEX IF NOT EXISTS approval_requests_resolved_by_idx ON public.approval_requests (resolved_by);

-- public.debit_notes.debit_notes_company_id_bill_id_fkey
CREATE INDEX IF NOT EXISTS debit_notes_company_id_bill_id_idx ON public.debit_notes (company_id, bill_id);

-- public.customer_return_lines.customer_return_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS customer_return_lines_company_id_tax_code_id_idx ON public.customer_return_lines (company_id, tax_code_id);

-- public.goods_receipts.goods_receipts_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipts_company_id_warehouse_id_idx ON public.goods_receipts (company_id, warehouse_id);

-- public.delivery_notes.delivery_notes_company_id_so_id_fkey
CREATE INDEX IF NOT EXISTS delivery_notes_company_id_so_id_idx ON public.delivery_notes (company_id, so_id);

-- public.internal_transfer_lines.internal_transfer_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS internal_transfer_lines_company_id_product_id_idx ON public.internal_transfer_lines (company_id, product_id);

-- public.customer_invoice_lines.customer_invoice_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoice_lines_company_id_tax_code_id_idx ON public.customer_invoice_lines (company_id, tax_code_id);

-- public.vendor_bills.vendor_bills_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS vendor_bills_company_id_currency_idx ON public.vendor_bills (company_id, currency);

-- public.notifications.notifications_operational_alert_fk
CREATE INDEX IF NOT EXISTS notifications_company_id_operational_alert_id_idx ON public.notifications (company_id, operational_alert_id);

-- public.vendor_returns.vendor_returns_company_id_grn_id_fkey
CREATE INDEX IF NOT EXISTS vendor_returns_company_id_grn_id_idx ON public.vendor_returns (company_id, grn_id);

-- public.goods_receipts.goods_receipts_company_id_po_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipts_company_id_po_id_idx ON public.goods_receipts (company_id, po_id);

-- public.vendor_return_lines.vendor_return_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS vendor_return_lines_company_id_product_id_idx ON public.vendor_return_lines (company_id, product_id);

-- public.opportunities.opportunities_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS opportunities_company_id_customer_id_idx ON public.opportunities (company_id, customer_id);

-- public.rfqs.rfqs_company_id_awarded_vendor_id_fkey
CREATE INDEX IF NOT EXISTS rfqs_company_id_awarded_vendor_id_idx ON public.rfqs (company_id, awarded_vendor_id);

-- public.notifications.notifications_company_id_approval_step_id_fkey
CREATE INDEX IF NOT EXISTS notifications_company_id_approval_step_id_idx ON public.notifications (company_id, approval_step_id);

-- public.sales_orders.sales_orders_company_id_quote_id_fkey
CREATE INDEX IF NOT EXISTS sales_orders_company_id_quote_id_idx ON public.sales_orders (company_id, quote_id);

-- public.credit_notes.credit_notes_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS credit_notes_company_id_customer_id_idx ON public.credit_notes (company_id, customer_id);

-- public.internal_transfers.internal_transfers_company_id_to_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS internal_transfers_company_id_to_warehouse_id_idx ON public.internal_transfers (company_id, to_warehouse_id);

-- public.sales_orders.sales_orders_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS sales_orders_company_id_customer_id_idx ON public.sales_orders (company_id, customer_id);

-- public.period_close_runs.period_close_runs_completed_by_fkey
CREATE INDEX IF NOT EXISTS period_close_runs_completed_by_idx ON public.period_close_runs (completed_by);

-- public.customer_returns.customer_returns_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS customer_returns_company_id_customer_id_idx ON public.customer_returns (company_id, customer_id);

-- public.debit_notes.debit_notes_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS debit_notes_company_id_supplier_id_idx ON public.debit_notes (company_id, supplier_id);

-- public.fixed_assets.fixed_assets_company_id_accumulated_depreciation_account_i_fkey
CREATE INDEX IF NOT EXISTS fixed_assets_company_id_accumulated_depreciation_account_id_idx ON public.fixed_assets (company_id, accumulated_depreciation_account_id);

-- public.delivery_note_lines.delivery_note_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS delivery_note_lines_company_id_tax_code_id_idx ON public.delivery_note_lines (company_id, tax_code_id);

-- public.approval_steps.approval_steps_company_id_approval_rule_id_fkey
CREATE INDEX IF NOT EXISTS approval_steps_company_id_approval_rule_id_idx ON public.approval_steps (company_id, approval_rule_id);

-- public.internal_transfers.internal_transfers_company_id_from_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS internal_transfers_company_id_from_warehouse_id_idx ON public.internal_transfers (company_id, from_warehouse_id);

-- public.audit_events.audit_events_by_fkey
CREATE INDEX IF NOT EXISTS audit_events_by_idx ON public.audit_events (by);

-- public.credit_notes.credit_notes_company_id_customer_return_id_fkey
CREATE INDEX IF NOT EXISTS credit_notes_company_id_customer_return_id_idx ON public.credit_notes (company_id, customer_return_id);

-- public.delivery_notes.delivery_notes_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS delivery_notes_company_id_customer_id_idx ON public.delivery_notes (company_id, customer_id);

-- public.customer_invoices.customer_invoices_company_id_customer_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoices_company_id_customer_id_idx ON public.customer_invoices (company_id, customer_id);

-- public.warehouses.warehouses_company_id_branch_id_fkey
CREATE INDEX IF NOT EXISTS warehouses_company_id_branch_id_idx ON public.warehouses (company_id, branch_id);

-- public.goods_receipt_lines.goods_receipt_lines_company_id_po_line_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipt_lines_company_id_po_line_id_idx ON public.goods_receipt_lines (company_id, po_line_id);

-- public.delivery_note_lines.delivery_note_lines_company_id_so_line_id_fkey
CREATE INDEX IF NOT EXISTS delivery_note_lines_company_id_so_line_id_idx ON public.delivery_note_lines (company_id, so_line_id);

-- public.journal_entry_lines.journal_entry_lines_company_id_account_id_fkey
CREATE INDEX IF NOT EXISTS journal_entry_lines_company_id_account_id_idx ON public.journal_entry_lines (company_id, account_id);

-- public.vendor_return_lines.vendor_return_lines_company_id_grn_line_id_fkey
CREATE INDEX IF NOT EXISTS vendor_return_lines_company_id_grn_line_id_idx ON public.vendor_return_lines (company_id, grn_line_id);

-- public.account_mappings.account_mappings_company_id_account_id_fkey
CREATE INDEX IF NOT EXISTS account_mappings_company_id_account_id_idx ON public.account_mappings (company_id, account_id);

-- public.ai_queued_actions.ai_queued_actions_created_by_fkey
CREATE INDEX IF NOT EXISTS ai_queued_actions_created_by_idx ON public.ai_queued_actions (created_by);

-- public.period_close_runs.period_close_runs_started_by_fkey
CREATE INDEX IF NOT EXISTS period_close_runs_started_by_idx ON public.period_close_runs (started_by);

-- public.stock_moves.stock_moves_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS stock_moves_company_id_warehouse_id_idx ON public.stock_moves (company_id, warehouse_id);

-- public.bank_accounts.bank_accounts_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS bank_accounts_company_id_currency_idx ON public.bank_accounts (company_id, currency);

-- public.vendor_bills.vendor_bills_company_id_po_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bills_company_id_po_id_idx ON public.vendor_bills (company_id, po_id);

-- public.goods_receipt_lines.goods_receipt_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS goods_receipt_lines_company_id_tax_code_id_idx ON public.goods_receipt_lines (company_id, tax_code_id);

-- public.document_processing_jobs.document_processing_jobs_source_attachment_id_fkey
CREATE INDEX IF NOT EXISTS document_processing_jobs_source_attachment_id_idx ON public.document_processing_jobs (source_attachment_id);

-- public.fixed_assets.fixed_assets_company_id_depreciation_expense_account_id_fkey
CREATE INDEX IF NOT EXISTS fixed_assets_company_id_depreciation_expense_account_id_idx ON public.fixed_assets (company_id, depreciation_expense_account_id);

-- public.vendor_payments.vendor_payments_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS vendor_payments_company_id_supplier_id_idx ON public.vendor_payments (company_id, supplier_id);

-- public.ai_queued_actions.ai_queued_actions_executed_by_fkey
CREATE INDEX IF NOT EXISTS ai_queued_actions_executed_by_idx ON public.ai_queued_actions (executed_by);

-- public.reconciliation_matches.reconciliation_matches_created_by_fkey
CREATE INDEX IF NOT EXISTS reconciliation_matches_created_by_idx ON public.reconciliation_matches (created_by);

-- public.journal_entries.journal_entries_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS journal_entries_company_id_currency_idx ON public.journal_entries (company_id, currency);

-- public.quote_lines.quote_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS quote_lines_company_id_product_id_idx ON public.quote_lines (company_id, product_id);

-- public.sales_orders.sales_orders_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS sales_orders_company_id_warehouse_id_idx ON public.sales_orders (company_id, warehouse_id);

-- public.price_lists.price_lists_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS price_lists_company_id_currency_idx ON public.price_lists (company_id, currency);

-- public.bank_statements.bank_statements_company_id_bank_account_id_fkey
CREATE INDEX IF NOT EXISTS bank_statements_company_id_bank_account_id_idx ON public.bank_statements (company_id, bank_account_id);

-- public.accounts.accounts_company_id_parent_fkey
CREATE INDEX IF NOT EXISTS accounts_company_id_parent_idx ON public.accounts (company_id, parent);

-- public.customer_return_lines.customer_return_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS customer_return_lines_company_id_product_id_idx ON public.customer_return_lines (company_id, product_id);

-- public.delivery_note_lines.delivery_note_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS delivery_note_lines_company_id_product_id_idx ON public.delivery_note_lines (company_id, product_id);

-- public.customer_invoice_lines.customer_invoice_lines_company_id_dn_line_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoice_lines_company_id_dn_line_id_idx ON public.customer_invoice_lines (company_id, dn_line_id);

-- public.ai_queued_actions.ai_queued_actions_reviewed_by_fkey
CREATE INDEX IF NOT EXISTS ai_queued_actions_reviewed_by_idx ON public.ai_queued_actions (reviewed_by);

-- public.customer_return_lines.customer_return_lines_company_id_dn_line_id_fkey
CREATE INDEX IF NOT EXISTS customer_return_lines_company_id_dn_line_id_idx ON public.customer_return_lines (company_id, dn_line_id);

-- public.customer_invoices.customer_invoices_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS customer_invoices_company_id_currency_idx ON public.customer_invoices (company_id, currency);

-- public.document_processing_jobs.document_processing_jobs_created_by_fkey
CREATE INDEX IF NOT EXISTS document_processing_jobs_created_by_idx ON public.document_processing_jobs (created_by);

-- public.rfq_quotes.rfq_quotes_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS rfq_quotes_company_id_currency_idx ON public.rfq_quotes (company_id, currency);

-- public.vendor_payments.vendor_payments_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS vendor_payments_company_id_currency_idx ON public.vendor_payments (company_id, currency);

-- public.platform_provisioning_operations.platform_provisioning_operations_invitation_id_fkey
CREATE INDEX IF NOT EXISTS platform_provisioning_operations_invitation_id_idx ON public.platform_provisioning_operations (invitation_id);

-- public.stock_adjustment_lines.stock_adjustment_lines_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS stock_adjustment_lines_company_id_warehouse_id_idx ON public.stock_adjustment_lines (company_id, warehouse_id);

-- public.inventory_lots.inventory_lots_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS inventory_lots_company_id_warehouse_id_idx ON public.inventory_lots (company_id, warehouse_id);

-- public.vendor_returns.vendor_returns_company_id_warehouse_id_fkey
CREATE INDEX IF NOT EXISTS vendor_returns_company_id_warehouse_id_idx ON public.vendor_returns (company_id, warehouse_id);

-- public.credit_notes.credit_notes_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS credit_notes_company_id_currency_idx ON public.credit_notes (company_id, currency);

-- public.vendor_returns.vendor_returns_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS vendor_returns_company_id_supplier_id_idx ON public.vendor_returns (company_id, supplier_id);

-- public.asset_depreciation_entries.asset_depreciation_entries_company_id_run_id_fkey
CREATE INDEX IF NOT EXISTS asset_depreciation_entries_company_id_run_id_idx ON public.asset_depreciation_entries (company_id, run_id);

-- public.asset_depreciation_entries.asset_depreciation_entries_company_id_fiscal_period_id_fkey
CREATE INDEX IF NOT EXISTS asset_depreciation_entries_company_id_fiscal_period_id_idx ON public.asset_depreciation_entries (company_id, fiscal_period_id);

-- public.purchase_requisition_lines.purchase_requisition_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS purchase_requisition_lines_company_id_product_id_idx ON public.purchase_requisition_lines (company_id, product_id);

-- public.customer_receipts.customer_receipts_company_id_bank_account_id_fkey
CREATE INDEX IF NOT EXISTS customer_receipts_company_id_bank_account_id_idx ON public.customer_receipts (company_id, bank_account_id);

-- public.customer_returns.customer_returns_company_id_dn_id_fkey
CREATE INDEX IF NOT EXISTS customer_returns_company_id_dn_id_idx ON public.customer_returns (company_id, dn_id);

-- public.purchase_order_lines.purchase_order_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS purchase_order_lines_company_id_tax_code_id_idx ON public.purchase_order_lines (company_id, tax_code_id);

-- public.quotes.quotes_company_id_currency_fkey
CREATE INDEX IF NOT EXISTS quotes_company_id_currency_idx ON public.quotes (company_id, currency);

-- public.platform_provisioning_operations.platform_provisioning_operations_actor_id_fkey
CREATE INDEX IF NOT EXISTS platform_provisioning_operations_actor_id_idx ON public.platform_provisioning_operations (actor_id);

-- public.sales_order_lines.sales_order_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS sales_order_lines_company_id_tax_code_id_idx ON public.sales_order_lines (company_id, tax_code_id);

-- public.customer_invoice_lines.customer_invoice_lines_company_id_so_line_id_fkey
CREATE INDEX IF NOT EXISTS customer_invoice_lines_company_id_so_line_id_idx ON public.customer_invoice_lines (company_id, so_line_id);

-- public.reconciliation_sessions.reconciliation_sessions_completed_by_fkey
CREATE INDEX IF NOT EXISTS reconciliation_sessions_completed_by_idx ON public.reconciliation_sessions (completed_by);

-- public.rfq_quotes.rfq_quotes_company_id_vendor_id_fkey
CREATE INDEX IF NOT EXISTS rfq_quotes_company_id_vendor_id_idx ON public.rfq_quotes (company_id, vendor_id);

-- public.vendor_bills.vendor_bills_company_id_grn_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bills_company_id_grn_id_idx ON public.vendor_bills (company_id, grn_id);

-- public.email_log.email_log_requested_by_fkey
CREATE INDEX IF NOT EXISTS email_log_requested_by_idx ON public.email_log (requested_by);

-- public.reconciliation_matches.reconciliation_matches_company_id_journal_entry_id_fkey
CREATE INDEX IF NOT EXISTS reconciliation_matches_company_id_journal_entry_id_idx ON public.reconciliation_matches (company_id, journal_entry_id);

-- public.purchase_orders.purchase_orders_company_id_supplier_id_fkey
CREATE INDEX IF NOT EXISTS purchase_orders_company_id_supplier_id_idx ON public.purchase_orders (company_id, supplier_id);

-- public.attachments.attachments_uploaded_by_fkey
CREATE INDEX IF NOT EXISTS attachments_uploaded_by_idx ON public.attachments (uploaded_by);

-- public.customer_returns.customer_returns_credit_note_fk
CREATE INDEX IF NOT EXISTS customer_returns_company_id_credit_note_id_idx ON public.customer_returns (company_id, credit_note_id);

-- public.vendor_bill_lines.vendor_bill_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bill_lines_company_id_tax_code_id_idx ON public.vendor_bill_lines (company_id, tax_code_id);

-- public.quote_lines.quote_lines_company_id_tax_code_id_fkey
CREATE INDEX IF NOT EXISTS quote_lines_company_id_tax_code_id_idx ON public.quote_lines (company_id, tax_code_id);

-- public.vendor_bill_lines.vendor_bill_lines_company_id_product_id_fkey
CREATE INDEX IF NOT EXISTS vendor_bill_lines_company_id_product_id_idx ON public.vendor_bill_lines (company_id, product_id);
