-- Drop unused indexes (Sales + Finance + Misc batch).
--
-- NOTE on CONCURRENTLY: InsForge executes each migration inside its own
-- transaction (see migrations.md "Do not include transaction statements"
-- and the comment in 20260820212431_fk-covering-indexes.sql). PostgreSQL
-- forbids DROP INDEX CONCURRENTLY inside a transaction block
-- (https://www.postgresql.org/docs/current/sql-dropindex.html). InsForge
-- exposes no per-migration opt-out, so these drops use plain DROP INDEX
-- IF EXISTS. DROP INDEX is fast (no table scan) and only briefly takes an
-- ACCESS EXCLUSIVE lock per table; acceptable here since these indexes are
-- unused. For zero-downtime on a busy prod DB, run equivalent
-- DROP INDEX CONCURRENTLY outside a migration first, then no-op this file.
--
-- Skipped — FK-covering indexes (kept; created by
--   20260820212431_fk-covering-indexes.sql and
--   20260820212705_email-log-requested-by-fk-index.sql).
--   These cover FK referencing columns and must NOT be dropped:
--   sales_orders_company_id_customer_id_idx
--   sales_orders_company_id_warehouse_id_idx
--   sales_orders_company_id_currency_idx
--   sales_orders_company_id_quote_id_idx
--   sales_order_lines_company_id_tax_code_id_idx
--   quotes_company_id_currency_idx
--   quotes_company_id_opportunity_id_idx
--   quotes_company_id_customer_id_idx
--   quote_lines_company_id_product_id_idx
--   quote_lines_company_id_tax_code_id_idx
--   opportunities_company_id_customer_id_idx
--   customer_invoices_company_id_currency_idx
--   customer_invoices_company_id_so_id_idx
--   customer_invoices_company_id_customer_id_idx
--   customer_invoice_lines_company_id_so_line_id_idx
--   customer_invoice_lines_company_id_dn_line_id_idx
--   customer_invoice_lines_company_id_tax_code_id_idx
--   customer_receipts_company_id_customer_id_idx
--   customer_receipts_company_id_bank_account_id_idx
--   customer_receipts_company_id_currency_idx
--   customer_receipt_allocations_company_id_invoice_id_idx
--   customer_returns_company_id_credit_note_id_idx
--   customer_returns_company_id_dn_id_idx
--   customer_returns_company_id_customer_id_idx
--   customer_returns_company_id_warehouse_id_idx
--   customer_return_lines_company_id_product_id_idx
--   customer_return_lines_company_id_tax_code_id_idx
--   customer_return_lines_company_id_dn_line_id_idx
--   credit_notes_company_id_currency_idx
--   credit_notes_company_id_invoice_id_idx
--   credit_notes_company_id_customer_return_id_idx
--   credit_notes_company_id_customer_id_idx
--   delivery_notes_company_id_customer_id_idx
--   delivery_notes_company_id_so_id_idx
--   delivery_notes_company_id_warehouse_id_idx
--   delivery_note_lines_company_id_tax_code_id_idx
--   delivery_note_lines_company_id_product_id_idx
--   delivery_note_lines_company_id_so_line_id_idx
--   accounts_company_id_parent_idx
--   account_mappings_company_id_account_id_idx
--   bank_accounts_company_id_account_id_idx
--   bank_accounts_company_id_currency_idx
--   journal_entries_company_id_currency_idx
--   journal_entry_lines_company_id_account_id_idx
--   fx_rates_company_id_quote_currency_idx
--   platform_provisioning_operations_actor_id_idx
--   platform_provisioning_operations_invitation_id_idx
--   write_commands_actor_user_id_idx
--   document_processing_jobs_created_by_idx
--   attachments_uploaded_by_idx
--   email_log_requested_by_idx
--   email_log_requested_by_fkey_idx
--   audit_events_by_idx
--   ai_suggestions_created_by_idx
--   invitations_accepted_by_idx
--   invitations_invited_by_idx
--   period_close_tasks_assigned_to_idx
--   period_close_runs_started_by_idx
--   period_close_runs_completed_by_idx
--   notifications_company_id_approval_step_id_idx
--   notifications_company_id_operational_alert_id_idx
--   suppliers_company_id_payment_term_id_idx

-- public.sales_orders
DROP INDEX IF EXISTS public.sales_orders_search_simple_gin_idx;

-- public.sales_order_lines
DROP INDEX IF EXISTS public.sales_order_lines_item_idx;

-- public.quotes
DROP INDEX IF EXISTS public.quotes_search_simple_gin_idx;

-- public.customers
DROP INDEX IF EXISTS public.customers_search_simple_gin_idx;

-- public.customer_invoices
DROP INDEX IF EXISTS public.customer_invoices_search_simple_gin_idx;

-- public.customer_invoice_lines
DROP INDEX IF EXISTS public.customer_invoice_lines_item_idx;

-- public.customer_receipts
DROP INDEX IF EXISTS public.customer_receipts_search_simple_gin_idx;

-- public.customer_returns
DROP INDEX IF EXISTS public.customer_returns_search_simple_gin_idx;

-- public.customer_return_lines
DROP INDEX IF EXISTS public.customer_return_lines_company_id_idx;

-- public.credit_notes
DROP INDEX IF EXISTS public.credit_notes_search_simple_gin_idx;

-- public.delivery_notes
DROP INDEX IF EXISTS public.delivery_notes_search_simple_gin_idx;

-- public.accounts
DROP INDEX IF EXISTS public.accounts_search_simple_gin_idx;

-- public.journal_entries
DROP INDEX IF EXISTS public.journal_entries_search_simple_gin_idx;

-- public.write_commands
DROP INDEX IF EXISTS public.write_commands_company_doc_idx;
DROP INDEX IF EXISTS public.write_commands_company_created_idx;

-- public.document_links
DROP INDEX IF EXISTS public.document_links_to_idx;
DROP INDEX IF EXISTS public.document_links_from_idx;

-- public.document_processing_jobs
DROP INDEX IF EXISTS public.document_processing_jobs_list_idx;

-- public.attachments
DROP INDEX IF EXISTS public.attachments_doc_idx;
DROP INDEX IF EXISTS public.attachments_uploader_idx;
DROP INDEX IF EXISTS public.attachments_company_id_idx;

-- public.email_log
DROP INDEX IF EXISTS public.email_log_document_idx;
DROP INDEX IF EXISTS public.email_log_delivery_idx;

-- public.audit_events
DROP INDEX IF EXISTS public.audit_events_doc_idx;

-- public.ai_suggestions
DROP INDEX IF EXISTS public.ai_suggestions_creator_idx;
DROP INDEX IF EXISTS public.ai_suggestions_list_idx;
DROP INDEX IF EXISTS public.ai_suggestions_expiry_idx;
DROP INDEX IF EXISTS public.ai_suggestions_scope_idx;

-- public.notifications
DROP INDEX IF EXISTS public.notifications_recipient_unread_idx;

-- public.scheduled_job_runs
DROP INDEX IF EXISTS public.scheduled_job_runs_job_status_idx;

-- public.suppliers
DROP INDEX IF EXISTS public.suppliers_company_id_idx;
DROP INDEX IF EXISTS public.suppliers_search_simple_gin_idx;
