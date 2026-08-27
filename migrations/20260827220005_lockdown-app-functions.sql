-- Lockdown non-platform SECURITY DEFINER functions flagged dangerous-function
-- by the InsForge advisor (callable by authenticated).
--
-- These are app-called RPCs (create_*, post_*, transition_*, report_*, item_*,
-- recon, email, AI, notification, identity/admin, RLS helpers). The app calls
-- them via @insforge/sdk with authenticated user sessions, so the
-- `authenticated` EXECUTE grant is INTENTIONALLY LEFT INTACT. Revoking it
-- would break the app.
--
-- Per function, two uniform defenses:
--   1. ALTER FUNCTION ... SET search_path = ''  (defense in depth; forces
--      schema-qualified resolution, neutralizes search_path hijack via
--      pg_temp / writable schemas).
--   2. REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC  (the PUBLIC grant is the
--      footgun; authenticated stays).
--
-- Functions are NOT converted to SECURITY INVOKER: they need owner privileges
-- to bypass RLS for cross-tenant writes / posting.
--
-- References:
--   https://www.postgresql.org/docs/18/perm-functions.html
--   https://www.cybertec-postgresql.com/en/abusing-security-definer-functions/
--   https://tomodahinata.com/en/blog/supabase-security-definer-function-search-path-guide
--   https://www.guardlayer.io/blog/supabase-security-definer-search-path

-- ===========================================================================
-- Section 1 — Write RPCs: document creation, posting, transitions, approvals,
--             period close, fiscal year
-- ===========================================================================

ALTER FUNCTION public.create_approval_request(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_approval_request(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text) FROM PUBLIC;

ALTER FUNCTION public.create_customer_receipt(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_customer_receipt(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_customer_return(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_customer_return(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_delivery_note(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_delivery_note(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_goods_receipt(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_goods_receipt(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_internal_transfer(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_internal_transfer(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_journal_entry(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_journal_entry(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_purchase_order(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_purchase_order(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_purchase_requisition(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_purchase_requisition(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_quote(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_quote(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_rfq(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_rfq(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_sales_order(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_sales_order(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_stock_adjustment(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_stock_adjustment(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.create_vendor_bill(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb, p_source_ocr_job_id bigint) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_vendor_bill(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb, p_source_ocr_job_id bigint) FROM PUBLIC;

ALTER FUNCTION public.create_vendor_return(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.create_vendor_return(p_idempotency_key text, p_intent text, p_header jsonb, p_lines jsonb, p_source jsonb) FROM PUBLIC;

ALTER FUNCTION public.award_rfq(p_rfq_id text, p_quote_id text, p_expected_row_version integer, p_idempotency_key text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.award_rfq(p_rfq_id text, p_quote_id text, p_expected_row_version integer, p_idempotency_key text) FROM PUBLIC;

ALTER FUNCTION public.assert_document_row_version(p_doc_type text, p_doc_id text, p_expected_row_version integer) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.assert_document_row_version(p_doc_type text, p_doc_id text, p_expected_row_version integer) FROM PUBLIC;

ALTER FUNCTION public.post_document(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.post_document(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text) FROM PUBLIC;

ALTER FUNCTION public.reverse_document(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text, p_reason text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.reverse_document(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text, p_reason text) FROM PUBLIC;

ALTER FUNCTION public.transition_document(p_doc_type text, p_doc_id text, p_action text, p_expected_row_version integer, p_idempotency_key text, p_reason text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.transition_document(p_doc_type text, p_doc_id text, p_action text, p_expected_row_version integer, p_idempotency_key text, p_reason text) FROM PUBLIC;

ALTER FUNCTION public.update_document_header(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text, p_patch jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.update_document_header(p_doc_type text, p_doc_id text, p_expected_row_version integer, p_idempotency_key text, p_patch jsonb) FROM PUBLIC;

ALTER FUNCTION public.resolve_approval_request(p_approval_request_id text, p_decision text, p_expected_row_version integer, p_idempotency_key text, p_reason text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.resolve_approval_request(p_approval_request_id text, p_decision text, p_expected_row_version integer, p_idempotency_key text, p_reason text) FROM PUBLIC;

ALTER FUNCTION public.close_fiscal_year(p_idempotency_key text, p_year integer) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.close_fiscal_year(p_idempotency_key text, p_year integer) FROM PUBLIC;

ALTER FUNCTION public.set_fiscal_period_status(p_idempotency_key text, p_fiscal_period_id text, p_status text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.set_fiscal_period_status(p_idempotency_key text, p_fiscal_period_id text, p_status text) FROM PUBLIC;

ALTER FUNCTION public.start_period_close(p_idempotency_key text, p_fiscal_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.start_period_close(p_idempotency_key text, p_fiscal_period_id text) FROM PUBLIC;

ALTER FUNCTION public.rescan_period_close(p_idempotency_key text, p_fiscal_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.rescan_period_close(p_idempotency_key text, p_fiscal_period_id text) FROM PUBLIC;

ALTER FUNCTION public.ensure_period_close_run(p_company_id text, p_fiscal_period_id text, p_started_by uuid) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.ensure_period_close_run(p_company_id text, p_fiscal_period_id text, p_started_by uuid) FROM PUBLIC;

ALTER FUNCTION public.ensure_period_close_tasks(p_run_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.ensure_period_close_tasks(p_run_id text) FROM PUBLIC;

ALTER FUNCTION public.complete_period_close_task(p_idempotency_key text, p_task_id text, p_status text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.complete_period_close_task(p_idempotency_key text, p_task_id text, p_status text) FROM PUBLIC;

-- ===========================================================================
-- Section 2 — Identity & membership admin
-- ===========================================================================

ALTER FUNCTION public.set_member_roles(p_user_id uuid, p_roles text[]) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.set_member_roles(p_user_id uuid, p_roles text[]) FROM PUBLIC;

ALTER FUNCTION public.deactivate_member(p_user_id uuid) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.deactivate_member(p_user_id uuid) FROM PUBLIC;

ALTER FUNCTION public.invite_user(p_email text, p_roles text[], p_request_id uuid, p_token_hash text, p_expires_in interval) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.invite_user(p_email text, p_roles text[], p_request_id uuid, p_token_hash text, p_expires_in interval) FROM PUBLIC;

ALTER FUNCTION public.rotate_invitation_token(p_invitation_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.rotate_invitation_token(p_invitation_id text) FROM PUBLIC;

-- ===========================================================================
-- Section 3 — RLS / security helper functions (SECURITY DEFINER, called from
--             RLS policies and app code; schema-qualify references inside)
-- ===========================================================================

ALTER FUNCTION public.is_company_admin() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.is_company_admin() FROM PUBLIC;

ALTER FUNCTION public.is_platform_admin() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC;

ALTER FUNCTION public.my_company_id() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.my_company_id() FROM PUBLIC;

ALTER FUNCTION public.is_user_in_my_company(p_user_id uuid) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.is_user_in_my_company(p_user_id uuid) FROM PUBLIC;

ALTER FUNCTION public.has_company_role(VARIADIC p_roles text[]) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.has_company_role(VARIADIC p_roles text[]) FROM PUBLIC;

ALTER FUNCTION public.assert_write_capability(p_capability text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.assert_write_capability(p_capability text) FROM PUBLIC;

ALTER FUNCTION public.resolve_email_company_id(p_kind text, p_doc_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.resolve_email_company_id(p_kind text, p_doc_id text) FROM PUBLIC;

-- ===========================================================================
-- Section 4 — Reports
-- ===========================================================================

ALTER FUNCTION public.report_ap_aging() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_ap_aging() FROM PUBLIC;

ALTER FUNCTION public.report_ar_aging() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_ar_aging() FROM PUBLIC;

ALTER FUNCTION public.report_balance_sheet(p_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_balance_sheet(p_period_id text) FROM PUBLIC;

ALTER FUNCTION public.report_cash_flow(p_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_cash_flow(p_period_id text) FROM PUBLIC;

ALTER FUNCTION public.report_pnl(p_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_pnl(p_period_id text) FROM PUBLIC;

ALTER FUNCTION public.report_trial_balance() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_trial_balance() FROM PUBLIC;

-- ===========================================================================
-- Section 5 — Reconciliation & bank statement
-- ===========================================================================

ALTER FUNCTION public.accept_reconciliation_match(p_idempotency_key text, p_match_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.accept_reconciliation_match(p_idempotency_key text, p_match_id text) FROM PUBLIC;

ALTER FUNCTION public.complete_reconciliation_session(p_idempotency_key text, p_statement_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.complete_reconciliation_session(p_idempotency_key text, p_statement_id text) FROM PUBLIC;

ALTER FUNCTION public.delete_reconciliation_rule(p_idempotency_key text, p_rule_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.delete_reconciliation_rule(p_idempotency_key text, p_rule_id text) FROM PUBLIC;

ALTER FUNCTION public.ensure_reconciliation_session(p_statement_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.ensure_reconciliation_session(p_statement_id text) FROM PUBLIC;

ALTER FUNCTION public.import_bank_statement(p_idempotency_key text, p_header jsonb, p_lines jsonb, p_attachment jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.import_bank_statement(p_idempotency_key text, p_header jsonb, p_lines jsonb, p_attachment jsonb) FROM PUBLIC;

ALTER FUNCTION public.manual_reconciliation_match(p_idempotency_key text, p_line_id text, p_journal_entry_id text, p_source_doc_type text, p_source_doc_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.manual_reconciliation_match(p_idempotency_key text, p_line_id text, p_journal_entry_id text, p_source_doc_type text, p_source_doc_id text) FROM PUBLIC;

ALTER FUNCTION public.persist_reconciliation_suggestion(p_statement_id text, p_line_id text, p_journal_entry_id text, p_source_doc_type text, p_source_doc_id text, p_confidence numeric, p_title_en text, p_title_ar text, p_rationale_en text, p_rationale_ar text, p_model text, p_prompt_version text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.persist_reconciliation_suggestion(p_statement_id text, p_line_id text, p_journal_entry_id text, p_source_doc_type text, p_source_doc_id text, p_confidence numeric, p_title_en text, p_title_ar text, p_rationale_en text, p_rationale_ar text, p_model text, p_prompt_version text) FROM PUBLIC;

ALTER FUNCTION public.reject_reconciliation_match(p_idempotency_key text, p_match_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.reject_reconciliation_match(p_idempotency_key text, p_match_id text) FROM PUBLIC;

ALTER FUNCTION public.skip_bank_statement_line(p_idempotency_key text, p_line_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.skip_bank_statement_line(p_idempotency_key text, p_line_id text) FROM PUBLIC;

ALTER FUNCTION public.upsert_reconciliation_rule(p_idempotency_key text, p_rule jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.upsert_reconciliation_rule(p_idempotency_key text, p_rule jsonb) FROM PUBLIC;

-- ===========================================================================
-- Section 6 — Email delivery, AI, notifications
-- ===========================================================================

ALTER FUNCTION public.claim_email_delivery(p_idempotency_key text, p_kind text, p_recipient text, p_subject text, p_locale text, p_doc_type text, p_doc_id text, p_lease_seconds integer) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.claim_email_delivery(p_idempotency_key text, p_kind text, p_recipient text, p_subject text, p_locale text, p_doc_type text, p_doc_id text, p_lease_seconds integer) FROM PUBLIC;

ALTER FUNCTION public.complete_email_delivery(p_delivery_id text, p_lease_token text, p_status text, p_provider_reference text, p_error_code text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.complete_email_delivery(p_delivery_id text, p_lease_token text, p_status text, p_provider_reference text, p_error_code text) FROM PUBLIC;

ALTER FUNCTION public.mark_inbox_notification_read(p_idempotency_key text, p_notification_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.mark_inbox_notification_read(p_idempotency_key text, p_notification_id text) FROM PUBLIC;

ALTER FUNCTION public.persist_ai_suggestion(p_scope_kind text, p_scope_type text, p_scope_id text, p_category text, p_severity text, p_title_en text, p_title_ar text, p_rationale_en text, p_rationale_ar text, p_confidence numeric, p_proposed_action jsonb, p_model text, p_prompt_version text, p_expires_at timestamp with time zone) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.persist_ai_suggestion(p_scope_kind text, p_scope_type text, p_scope_id text, p_category text, p_severity text, p_title_en text, p_title_ar text, p_rationale_en text, p_rationale_ar text, p_confidence numeric, p_proposed_action jsonb, p_model text, p_prompt_version text, p_expires_at timestamp with time zone) FROM PUBLIC;

ALTER FUNCTION public.queue_ai_action(p_suggestion_id text, p_action text, p_payload jsonb) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.queue_ai_action(p_suggestion_id text, p_action text, p_payload jsonb) FROM PUBLIC;

ALTER FUNCTION public.review_ai_action(p_action_id text, p_decision text, p_reason text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.review_ai_action(p_action_id text, p_decision text, p_reason text) FROM PUBLIC;

ALTER FUNCTION public.dismiss_ai_suggestion(p_suggestion_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.dismiss_ai_suggestion(p_suggestion_id text) FROM PUBLIC;

-- ===========================================================================
-- Section 7 — Item / product read RPCs & search
-- ===========================================================================

ALTER FUNCTION public.item_stock_by_warehouse(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_stock_by_warehouse(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_sales_history(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_sales_history(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_moves(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_moves(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_customers(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_customers(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_vendors(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_vendors(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_purchase_history(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_purchase_history(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_snapshot(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_snapshot(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.item_lots(p_product_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.item_lots(p_product_id text) FROM PUBLIC;

ALTER FUNCTION public.resolve_price_list_item(p_price_list_id text, p_product_id text, p_qty numeric, p_on_date date) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.resolve_price_list_item(p_price_list_id text, p_product_id text, p_qty numeric, p_on_date date) FROM PUBLIC;

ALTER FUNCTION public.search_all(p_query text, p_limit integer) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.search_all(p_query text, p_limit integer) FROM PUBLIC;
