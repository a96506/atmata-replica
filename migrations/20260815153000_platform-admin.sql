-- Phase 4 platform administration.
-- Consumes identity contracts from 20260815150000 (is_owner, accept_invitation).
-- Does not redefine invite_user / accept_invitation.

-- Suspension must terminate existing sessions' RLS, not only the next login.
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT cm.company_id
  FROM public.company_members AS cm
  JOIN public.companies AS c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.active
    AND c.status = 'active'
  LIMIT 1;
$$;

ALTER FUNCTION public.seed_company_defaults(text, text, text)
  SET search_path = pg_catalog, public, pg_temp;

-- Reviewed company-owned tables. M1–M12 baseline is 77; later company_id
-- tables must be inserted here in the same migration that creates them.
CREATE TABLE IF NOT EXISTS public.company_table_manifest (
  table_name text PRIMARY KEY
    CHECK (table_name = lower(table_name) AND table_name ~ '^[a-z][a-z0-9_]*$')
);

REVOKE ALL ON public.company_table_manifest FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_table_manifest TO project_admin;

INSERT INTO public.company_table_manifest (table_name) VALUES
  ('company_members'),
  ('invitations'),
  ('currencies'),
  ('branches'),
  ('warehouses'),
  ('locations'),
  ('tax_codes'),
  ('payment_terms'),
  ('bank_accounts'),
  ('fiscal_periods'),
  ('accounts'),
  ('products'),
  ('customers'),
  ('suppliers'),
  ('fx_rates'),
  ('price_lists'),
  ('price_list_items'),
  ('document_sequences'),
  ('account_mappings'),
  ('approval_rules'),
  ('purchase_requisitions'),
  ('purchase_requisition_lines'),
  ('rfqs'),
  ('rfq_sources'),
  ('rfq_invited_suppliers'),
  ('rfq_lines'),
  ('rfq_quotes'),
  ('rfq_quote_lines'),
  ('purchase_orders'),
  ('purchase_order_lines'),
  ('goods_receipts'),
  ('goods_receipt_lines'),
  ('vendor_bills'),
  ('vendor_bill_lines'),
  ('vendor_payments'),
  ('vendor_payment_allocations'),
  ('vendor_returns'),
  ('vendor_return_lines'),
  ('debit_notes'),
  ('opportunities'),
  ('quotes'),
  ('quote_lines'),
  ('sales_orders'),
  ('sales_order_lines'),
  ('delivery_notes'),
  ('delivery_note_lines'),
  ('customer_invoices'),
  ('customer_invoice_lines'),
  ('customer_receipts'),
  ('customer_receipt_allocations'),
  ('customer_returns'),
  ('customer_return_lines'),
  ('credit_notes'),
  ('journal_entries'),
  ('journal_entry_lines'),
  ('stock_moves'),
  ('internal_transfers'),
  ('internal_transfer_lines'),
  ('stock_adjustments'),
  ('stock_adjustment_lines'),
  ('document_links'),
  ('audit_events'),
  ('inventory_lots'),
  ('fixed_assets'),
  ('bank_statements'),
  ('bank_statement_lines'),
  ('reconciliation_sessions'),
  ('reconciliation_rules'),
  ('reconciliation_matches'),
  ('period_close_runs'),
  ('period_close_tasks'),
  ('approval_requests'),
  ('approval_steps'),
  ('approval_decisions'),
  ('notifications'),
  ('attachments'),
  ('document_processing_jobs'),
  ('email_log'),
  ('ai_suggestions'),
  ('ai_queued_actions'),
  ('ai_thresholds'),
  ('rfq_line_sources'),
  ('platform_provisioning_operations')
ON CONFLICT (table_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.company_table_allowlist_violations()
RETURNS TABLE(table_name text, issue text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.table_name, 'missing_from_manifest'::text
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'company_id'
    AND c.table_name NOT IN (
      SELECT m.table_name FROM public.company_table_manifest AS m
    )
  UNION ALL
  SELECT m.table_name, 'missing_company_id_column'::text
  FROM public.company_table_manifest AS m
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = m.table_name
      AND c.column_name = 'company_id'
  );
$$;

GRANT EXECUTE ON FUNCTION public.company_table_allowlist_violations()
  TO authenticated, project_admin;

CREATE TABLE IF NOT EXISTS public.platform_provisioning_operations (
  id uuid PRIMARY KEY,
  owner_email text NOT NULL
    CHECK (owner_email = lower(btrim(owner_email)) AND owner_email <> ''),
  owner_name text NOT NULL CHECK (char_length(trim(owner_name)) > 0),
  company_name text NOT NULL CHECK (char_length(trim(company_name)) > 0),
  company_id text REFERENCES public.companies(id) ON DELETE RESTRICT,
  invitation_id text REFERENCES public.invitations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_provisioning_owner_email_completed_idx
  ON public.platform_provisioning_operations (owner_email)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS platform_provisioning_operations_company_id_idx
  ON public.platform_provisioning_operations (company_id);

ALTER TABLE public.platform_provisioning_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_provisioning_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_provisioning_operations TO authenticated;

DROP POLICY IF EXISTS platform_provisioning_admin_read
  ON public.platform_provisioning_operations;
CREATE POLICY platform_provisioning_admin_read
  ON public.platform_provisioning_operations
  FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

CREATE OR REPLACE FUNCTION public.guard_platform_provisioning_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PLATFORM:INVARIANT:provisioning operations are append-only';
  END IF;
  IF OLD.status = 'completed' THEN
    IF NEW.owner_email IS DISTINCT FROM OLD.owner_email
      OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
      OR NEW.company_name IS DISTINCT FROM OLD.company_name
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
      OR NEW.result IS DISTINCT FROM OLD.result
      OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
      OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'PLATFORM:INVARIANT:completed provisioning result is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_provisioning_operations_immutable
  ON public.platform_provisioning_operations;
CREATE TRIGGER platform_provisioning_operations_immutable
  BEFORE UPDATE OR DELETE ON public.platform_provisioning_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_platform_provisioning_immutable();

CREATE OR REPLACE FUNCTION public.require_platform_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM:UNAUTHENTICATED';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM:FORBIDDEN';
  END IF;
  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.require_platform_admin() TO authenticated, project_admin;

-- Platform admins may send owner invitations for companies they do not belong to.
CREATE OR REPLACE FUNCTION public.resolve_email_company_id(p_kind text, p_doc_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  v_company_id := public.my_company_id();
  IF v_company_id IS NOT NULL THEN
    RETURN v_company_id;
  END IF;
  IF public.is_platform_admin()
    AND p_kind = 'user_invitation'
    AND p_doc_id IS NOT NULL THEN
    SELECT i.company_id
    INTO v_company_id
    FROM public.invitations AS i
    WHERE i.id = p_doc_id;
  END IF;
  RETURN v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_email_company_id(text, text)
  TO authenticated, project_admin;

CREATE OR REPLACE FUNCTION public.claim_email_delivery(
  p_idempotency_key text,
  p_kind text,
  p_recipient text,
  p_subject text,
  p_locale text,
  p_doc_type text DEFAULT NULL,
  p_doc_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_log public.email_log%ROWTYPE;
  v_claimed boolean := false;
  v_lease_token text;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.resolve_email_company_id(p_kind, p_doc_id);

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'quote_sent',
    'rfq_invitation',
    'approval_requested',
    'approval_rejected',
    'user_invitation'
  ) THEN
    RAISE EXCEPTION 'unsupported email kind';
  END IF;
  IF p_recipient IS NULL OR char_length(trim(p_recipient)) = 0
    OR p_subject IS NULL OR char_length(trim(p_subject)) = 0 THEN
    RAISE EXCEPTION 'recipient and subject required';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en', 'ar') THEN
    RAISE EXCEPTION 'unsupported locale';
  END IF;
  IF (p_doc_type IS NULL) <> (p_doc_id IS NULL) THEN
    RAISE EXCEPTION 'doc_type and doc_id must be supplied together';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 30 and 900';
  END IF;

  INSERT INTO public.email_log (
    company_id,
    kind,
    recipient,
    subject,
    locale,
    doc_type,
    doc_id,
    idempotency_key,
    requested_by
  )
  VALUES (
    v_company_id,
    p_kind,
    trim(p_recipient),
    trim(p_subject),
    p_locale,
    p_doc_type,
    p_doc_id,
    trim(p_idempotency_key),
    v_user_id
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING;

  SELECT e.*
  INTO v_log
  FROM public.email_log AS e
  WHERE e.company_id = v_company_id
    AND e.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;

  IF v_log.kind IS DISTINCT FROM p_kind
    OR v_log.recipient IS DISTINCT FROM trim(p_recipient)
    OR v_log.subject IS DISTINCT FROM trim(p_subject)
    OR v_log.locale IS DISTINCT FROM p_locale
    OR v_log.doc_type IS DISTINCT FROM p_doc_type
    OR v_log.doc_id IS DISTINCT FROM p_doc_id THEN
    RAISE EXCEPTION 'idempotency key already used with different email content';
  END IF;

  IF v_log.status IN ('queued', 'failed')
    OR (v_log.status = 'sending' AND v_log.lease_expires_at <= now()) THEN
    v_lease_token := public.gen_random_uuid()::text;

    UPDATE public.email_log
    SET status = 'sending',
        attempt_count = attempt_count + 1,
        last_error_code = NULL,
        lease_token_hash = encode(public.digest(v_lease_token, 'sha256'), 'hex'),
        lease_expires_at = now() + (p_lease_seconds * interval '1 second')
    WHERE company_id = v_company_id
      AND id = v_log.id
    RETURNING * INTO v_log;

    v_claimed := true;
  END IF;

  RETURN jsonb_build_object(
    'claimed', v_claimed,
    'leaseToken', CASE WHEN v_claimed THEN v_lease_token ELSE NULL END,
    'delivery', to_jsonb(v_log) - 'lease_token_hash'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_email_delivery(
  p_delivery_id text,
  p_lease_token text,
  p_status text,
  p_provider_reference text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS public.email_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_log public.email_log%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL AND public.is_platform_admin() THEN
    SELECT e.company_id
    INTO v_company_id
    FROM public.email_log AS e
    WHERE e.id = p_delivery_id
      AND e.requested_by = v_user_id;
  END IF;

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'completion status must be sent, failed, or skipped';
  END IF;
  IF p_lease_token IS NULL OR char_length(trim(p_lease_token)) = 0 THEN
    RAISE EXCEPTION 'lease token required';
  END IF;
  IF p_status = 'failed'
    AND (p_error_code IS NULL OR char_length(trim(p_error_code)) = 0) THEN
    RAISE EXCEPTION 'failed delivery requires an error code';
  END IF;

  SELECT e.*
  INTO v_log
  FROM public.email_log AS e
  WHERE e.company_id = v_company_id
    AND e.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'email delivery not found';
  END IF;
  IF v_log.status <> 'sending'
    OR v_log.lease_token_hash IS DISTINCT FROM
      encode(public.digest(trim(p_lease_token), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'email delivery lease is not active';
  END IF;

  UPDATE public.email_log
  SET status = p_status,
      provider_reference = CASE
        WHEN p_status = 'sent' THEN nullif(trim(p_provider_reference), '')
        ELSE provider_reference
      END,
      last_error_code = CASE
        WHEN p_status = 'failed' THEN trim(p_error_code)
        ELSE NULL
      END,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE NULL END,
      lease_token_hash = NULL,
      lease_expires_at = NULL
  WHERE company_id = v_company_id
    AND id = p_delivery_id
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_issue_invitation_token(p_invitation_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
  v_raw text;
  v_hash text;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_invitation_id IS NULL OR char_length(trim(p_invitation_id)) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:invitation id required';
  END IF;

  SELECT i.*
  INTO v_invitation
  FROM public.invitations AS i
  WHERE i.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;
  IF v_invitation.status <> 'pending' OR v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'PLATFORM:CONFLICT:invitation is not sendable';
  END IF;

  v_raw := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(public.digest(v_raw, 'sha256'), 'hex');

  UPDATE public.invitations
  SET token_hash = v_hash
  WHERE id = p_invitation_id;

  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_companies(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_search text;
  v_status text;
  v_offset integer;
  v_limit integer;
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.require_platform_admin();
  v_search := nullif(btrim(coalesce(p_search, '')), '');
  v_status := nullif(btrim(coalesce(p_status, '')), '');
  IF v_status IS NOT NULL AND v_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:invalid status';
  END IF;
  v_offset := GREATEST(coalesce(p_offset, 0), 0);
  v_limit := LEAST(GREATEST(coalesce(p_limit, 50), 1), 100);

  SELECT count(*)
  INTO v_total
  FROM public.companies AS c
  WHERE (v_status IS NULL OR c.status = v_status)
    AND (
      v_search IS NULL
      OR c.name ILIKE '%' || replace(replace(v_search, '\', '\\'), '%', '\%') || '%' ESCAPE '\'
      OR c.id ILIKE '%' || replace(replace(v_search, '\', '\\'), '%', '\%') || '%' ESCAPE '\'
    );

  SELECT coalesce(jsonb_agg(row_to_json(item) ORDER BY item."createdAt" DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      c.id,
      c.name,
      c.status,
      c.plan,
      c.tax_profile AS "taxProfile",
      c.base_currency AS "baseCurrency",
      c.vat_number AS "vatNumber",
      c.row_version AS "rowVersion",
      c.created_at AS "createdAt"
    FROM public.companies AS c
    WHERE (v_status IS NULL OR c.status = v_status)
      AND (
        v_search IS NULL
        OR c.name ILIKE '%' || replace(replace(v_search, '\', '\\'), '%', '\%') || '%' ESCAPE '\'
        OR c.id ILIKE '%' || replace(replace(v_search, '\', '\\'), '%', '\%') || '%' ESCAPE '\'
      )
    ORDER BY c.created_at DESC
    OFFSET v_offset
    LIMIT v_limit
  ) AS item;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'offset', v_offset,
    'limit', v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_get_company(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_members jsonb;
  v_invitations jsonb;
  v_audit jsonb;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_company_id IS NULL OR char_length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:company id required';
  END IF;

  SELECT *
  INTO v_company
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(item) ORDER BY item."createdAt"), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT
      cm.id,
      cm.user_id AS "userId",
      coalesce(up.email, '') AS email,
      coalesce(up.full_name, '') AS "fullName",
      cm.roles,
      cm.is_owner AS "isOwner",
      cm.active,
      cm.created_at AS "createdAt"
    FROM public.company_members AS cm
    LEFT JOIN public.user_profiles AS up ON up.id = cm.user_id
    WHERE cm.company_id = p_company_id
  ) AS item;

  SELECT coalesce(jsonb_agg(row_to_json(item) ORDER BY item."createdAt" DESC), '[]'::jsonb)
  INTO v_invitations
  FROM (
    SELECT
      i.id,
      i.email,
      i.roles,
      i.status,
      i.is_owner AS "isOwner",
      i.expires_at AS "expiresAt",
      i.created_at AS "createdAt"
    FROM public.invitations AS i
    WHERE i.company_id = p_company_id
  ) AS item;

  SELECT coalesce(jsonb_agg(row_to_json(item) ORDER BY item.at DESC), '[]'::jsonb)
  INTO v_audit
  FROM (
    SELECT
      a.id,
      a.from_state AS "fromState",
      a.to_state AS "toState",
      a."by",
      a.reason,
      a.at
    FROM public.audit_events AS a
    WHERE a.company_id = p_company_id
      AND a.doc_type = 'company'
      AND a.doc_id = p_company_id
    ORDER BY a.at DESC
    LIMIT 50
  ) AS item;

  RETURN jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'status', v_company.status,
    'plan', v_company.plan,
    'taxProfile', v_company.tax_profile,
    'baseCurrency', v_company.base_currency,
    'vatNumber', v_company.vat_number,
    'rowVersion', v_company.row_version,
    'createdAt', v_company.created_at,
    'members', v_members,
    'invitations', v_invitations,
    'audit', v_audit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_company_row_counts(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_exists boolean;
  v_table text;
  v_count bigint;
  v_total bigint := 0;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_company_id IS NULL OR char_length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:company id required';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id)
  INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;

  FOR v_table IN
    SELECT m.table_name
    FROM public.company_table_manifest AS m
    ORDER BY m.table_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE company_id = $1',
      v_table
    )
    INTO v_count
    USING p_company_id;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
    v_total := v_total + v_count;
  END LOOP;

  RETURN jsonb_build_object(
    'companyId', p_company_id,
    'totalRows', v_total,
    'counts', v_counts,
    'generatedAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_provision_company(
  p_operation_id uuid,
  p_name text,
  p_owner_email text,
  p_owner_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_name text;
  v_email text;
  v_owner_name text;
  v_existing public.platform_provisioning_operations%ROWTYPE;
  v_company_id text;
  v_invitation_id text;
  v_raw text;
  v_hash text;
BEGIN
  v_actor := public.require_platform_admin();
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:operation id required';
  END IF;
  v_name := btrim(coalesce(p_name, ''));
  v_email := lower(btrim(coalesce(p_owner_email, '')));
  v_owner_name := btrim(coalesce(p_owner_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:company name required';
  END IF;
  IF v_owner_name = '' THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:owner name required';
  END IF;
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:owner email required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_operation_id::text));
  PERFORM pg_advisory_xact_lock(hashtext(v_email));

  SELECT *
  INTO v_existing
  FROM public.platform_provisioning_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.owner_email IS DISTINCT FROM v_email
      OR v_existing.company_name IS DISTINCT FROM v_name
      OR v_existing.owner_name IS DISTINCT FROM v_owner_name THEN
      RAISE EXCEPTION 'PLATFORM:CONFLICT:operation id reused with different input';
    END IF;
    IF v_existing.status = 'completed' THEN
      IF v_existing.invitation_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.invitations AS i
          WHERE i.id = v_existing.invitation_id
            AND i.status = 'pending'
            AND i.expires_at > now()
        ) THEN
        v_raw := public.platform_issue_invitation_token(v_existing.invitation_id);
        RETURN v_existing.result || jsonb_build_object('invitationToken', v_raw);
      END IF;
      RETURN v_existing.result;
    END IF;
    RAISE EXCEPTION 'PLATFORM:CONFLICT:operation is not retryable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_profiles AS up
    JOIN public.company_members AS cm ON cm.user_id = up.id
    WHERE up.email = v_email
      AND cm.active
  ) THEN
    RAISE EXCEPTION 'PLATFORM:CONFLICT:owner email in use';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invitations AS i
    WHERE i.email = v_email
      AND i.status = 'pending'
      AND i.is_owner
      AND i.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'PLATFORM:CONFLICT:owner email in use';
  END IF;

  INSERT INTO public.companies (name, base_currency, tax_profile)
  VALUES (v_name, 'KWD', 'KW')
  RETURNING id INTO v_company_id;

  PERFORM public.seed_company_defaults(v_company_id, 'KWD', 'KW');

  v_raw := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(public.digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.invitations (
    company_id,
    email,
    roles,
    token_hash,
    invited_by,
    is_owner,
    request_id,
    expires_at
  )
  VALUES (
    v_company_id,
    v_email,
    ARRAY['admin']::text[],
    v_hash,
    v_actor,
    true,
    p_operation_id,
    now() + interval '7 days'
  )
  RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_events (
    company_id,
    doc_id,
    doc_type,
    from_state,
    to_state,
    "by",
    reason
  )
  VALUES (
    v_company_id,
    v_company_id,
    'company',
    NULL,
    'active',
    v_actor,
    'platform provision'
  );

  INSERT INTO public.platform_provisioning_operations (
    id,
    owner_email,
    owner_name,
    company_name,
    company_id,
    invitation_id,
    status,
    actor_id,
    result,
    completed_at
  )
  VALUES (
    p_operation_id,
    v_email,
    v_owner_name,
    v_name,
    v_company_id,
    v_invitation_id,
    'completed',
    v_actor,
    jsonb_build_object(
      'companyId', v_company_id,
      'invitationId', v_invitation_id
    ),
    now()
  );

  RETURN jsonb_build_object(
    'companyId', v_company_id,
    'invitationId', v_invitation_id,
    'invitationToken', v_raw
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_resend_owner_invitation(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
  v_raw text;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_company_id IS NULL OR char_length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:company id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;

  SELECT i.*
  INTO v_invitation
  FROM public.invitations AS i
  WHERE i.company_id = p_company_id
    AND i.is_owner
    AND i.status = 'pending'
    AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;

  v_raw := public.platform_issue_invitation_token(v_invitation.id);
  RETURN jsonb_build_object(
    'companyId', p_company_id,
    'invitationId', v_invitation.id,
    'invitationToken', v_raw,
    'email', v_invitation.email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_company_status(
  p_company_id text,
  p_status text,
  p_expected_row_version integer,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_company public.companies%ROWTYPE;
  v_reason text;
  v_from text;
BEGIN
  v_actor := public.require_platform_admin();
  IF p_company_id IS NULL OR char_length(trim(p_company_id)) = 0 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:company id required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:invalid status';
  END IF;
  IF p_expected_row_version IS NULL OR p_expected_row_version < 1 THEN
    RAISE EXCEPTION 'PLATFORM:VALIDATION:expected row version required';
  END IF;

  SELECT *
  INTO v_company
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM:NOT_FOUND';
  END IF;
  IF v_company.row_version IS DISTINCT FROM p_expected_row_version THEN
    RAISE EXCEPTION 'PLATFORM:STALE_VERSION:%', v_company.row_version;
  END IF;

  IF v_company.status = p_status THEN
    RETURN jsonb_build_object(
      'id', v_company.id,
      'status', v_company.status,
      'rowVersion', v_company.row_version
    );
  END IF;

  IF p_status = 'suspended' THEN
    v_reason := btrim(coalesce(p_reason, ''));
    IF v_reason = '' THEN
      RAISE EXCEPTION 'PLATFORM:VALIDATION:suspension reason required';
    END IF;
  ELSE
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  END IF;

  v_from := v_company.status;

  UPDATE public.companies
  SET status = p_status
  WHERE id = p_company_id
  RETURNING * INTO v_company;

  INSERT INTO public.audit_events (
    company_id,
    doc_id,
    doc_type,
    from_state,
    to_state,
    "by",
    reason
  )
  VALUES (
    p_company_id,
    p_company_id,
    'company',
    v_from,
    p_status,
    v_actor,
    coalesce(v_reason, 'platform reactivation')
  );

  RETURN jsonb_build_object(
    'id', v_company.id,
    'status', v_company.status,
    'rowVersion', v_company.row_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_company(text, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_issue_invitation_token(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_companies(text, text, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_company(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_company_row_counts(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_provision_company(uuid, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_resend_owner_invitation(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_company_status(text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_delivery(
  text, text, text, text, text, text, text, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_delivery(
  text, text, text, text, text
) TO authenticated;
