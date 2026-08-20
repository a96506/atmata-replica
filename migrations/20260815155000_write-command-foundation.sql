-- Phase 6 / M13 write command foundation.
-- Idempotency ledger, server-derived roles, expected_row_version on
-- transition/post/approval/reverse entry points, immediate-post matrix,
-- reverse with counter-effects, shared period-close helpers, and revoke of
-- direct document DML so mutations stay SECURITY DEFINER RPC-only.
-- Pattern: UNIQUE (company_id, idempotency_key) + request_hash mismatch guard
-- (PostgreSQL idempotency ledger; INSERT … ON CONFLICT DO NOTHING claim).

-- ---------------------------------------------------------------------------
-- 1. write_commands ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.write_commands (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL
    CHECK (char_length(trim(idempotency_key)) > 0),
  operation text NOT NULL
    CHECK (char_length(trim(operation)) > 0),
  request_hash text NOT NULL
    CHECK (char_length(request_hash) = 64),
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'failed')),
  result jsonb,
  error_code text,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  doc_type text,
  doc_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (company_id, id),
  UNIQUE (company_id, idempotency_key),
  CHECK (
    (doc_type IS NULL) = (doc_id IS NULL)
  ),
  CHECK (
    (status = 'completed' AND result IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'started' AND result IS NULL)
    OR (status = 'failed')
  )
);

CREATE INDEX write_commands_company_created_idx
  ON public.write_commands (company_id, created_at DESC);

CREATE INDEX write_commands_company_doc_idx
  ON public.write_commands (company_id, doc_type, doc_id)
  WHERE doc_type IS NOT NULL;

SELECT public.apply_company_access('write_commands');

REVOKE INSERT, UPDATE, DELETE ON public.write_commands
  FROM anon, authenticated;
GRANT SELECT ON public.write_commands TO authenticated;

INSERT INTO public.company_table_manifest (table_name)
VALUES ('write_commands')
ON CONFLICT (table_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Error + company context + role helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.raise_write_error(
  p_code text,
  p_detail text DEFAULT NULL,
  p_sqlstate text DEFAULT 'P0001'
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  IF p_detail IS NULL OR char_length(trim(p_detail)) = 0 THEN
    RAISE EXCEPTION 'WRITE:%', p_code
      USING ERRCODE = p_sqlstate;
  END IF;

  RAISE EXCEPTION 'WRITE:%:%', p_code, p_detail
    USING ERRCODE = p_sqlstate;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_company_context()
RETURNS TABLE (user_id uuid, company_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id text := public.my_company_id();
BEGIN
  IF v_user_id IS NULL THEN
    PERFORM public.raise_write_error('UNAUTHENTICATED');
  END IF;

  IF v_company_id IS NULL AND NOT public.is_platform_admin() THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'active company membership required');
  END IF;

  user_id := v_user_id;
  company_id := v_company_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_capability_roles(p_capability text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_capability
    WHEN 'buyer' THEN ARRAY['buyer', 'admin']::text[]
    WHEN 'warehouse' THEN ARRAY['warehouse', 'admin']::text[]
    WHEN 'ap_clerk' THEN ARRAY['ap_clerk', 'admin']::text[]
    WHEN 'ar_clerk' THEN ARRAY['ar_clerk', 'admin']::text[]
    WHEN 'accountant' THEN ARRAY['accountant', 'admin']::text[]
    WHEN 'approver' THEN ARRAY['approver', 'admin']::text[]
    WHEN 'admin' THEN ARRAY['admin']::text[]
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_write_capability(p_capability text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_roles text[];
BEGIN
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  v_roles := public.write_capability_roles(p_capability);
  IF v_roles IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'unknown write capability');
  END IF;

  IF NOT public.has_company_role(VARIADIC v_roles) THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'required company role missing');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_uses_approval(p_doc_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_doc_type = ANY (
    ARRAY[
      'po',
      'vendor_bill',
      'vendor_payment',
      'debit_note',
      'quote',
      'so',
      'customer_invoice',
      'customer_receipt',
      'credit_note'
    ]::text[]
  );
$$;

CREATE OR REPLACE FUNCTION public.document_allows_immediate_post(p_doc_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_doc_type = ANY (
    ARRAY[
      'grn',
      'dn',
      'journal_entry',
      'internal_transfer',
      'stock_adjustment'
    ]::text[]
  );
$$;

CREATE OR REPLACE FUNCTION public.request_hash_from_json(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(public.digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- 3. write_commands claim / complete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_write_command(
  p_idempotency_key text,
  p_operation text,
  p_request_hash text,
  p_doc_type text DEFAULT NULL,
  p_doc_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_row public.write_commands%ROWTYPE;
BEGIN
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'idempotency key required');
  END IF;
  IF p_operation IS NULL OR char_length(trim(p_operation)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'operation required');
  END IF;
  IF p_request_hash IS NULL OR char_length(p_request_hash) <> 64 THEN
    PERFORM public.raise_write_error('VALIDATION', 'request_hash must be sha256 hex');
  END IF;
  IF (p_doc_type IS NULL) <> (p_doc_id IS NULL) THEN
    PERFORM public.raise_write_error('VALIDATION', 'doc_type and doc_id must be supplied together');
  END IF;
  IF v_ctx.company_id IS NULL THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'company context required for writes');
  END IF;

  INSERT INTO public.write_commands (
    company_id,
    idempotency_key,
    operation,
    request_hash,
    actor_user_id,
    doc_type,
    doc_id
  )
  VALUES (
    v_ctx.company_id,
    trim(p_idempotency_key),
    trim(p_operation),
    lower(p_request_hash),
    v_ctx.user_id,
    p_doc_type,
    p_doc_id
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.write_commands AS wc
  WHERE wc.company_id = v_ctx.company_id
    AND wc.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('INVARIANT', 'write_commands claim missing');
  END IF;

  IF v_row.operation IS DISTINCT FROM trim(p_operation)
    OR v_row.request_hash IS DISTINCT FROM lower(p_request_hash)
    OR v_row.doc_type IS DISTINCT FROM p_doc_type
    OR v_row.doc_id IS DISTINCT FROM p_doc_id THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'idempotency key already used with different request'
    );
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'replay', true,
      'commandId', v_row.id,
      'result', v_row.result
    );
  END IF;

  IF v_row.status = 'failed' THEN
    PERFORM public.raise_write_error(
      coalesce(v_row.error_code, 'CONFLICT'),
      'idempotency key previously failed'
    );
  END IF;

  RETURN jsonb_build_object(
    'replay', false,
    'commandId', v_row.id,
    'result', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_write_command(
  p_command_id text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
BEGIN
  IF p_command_id IS NULL OR p_result IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'command id and result required');
  END IF;

  UPDATE public.write_commands
  SET status = 'completed',
      result = p_result,
      error_code = NULL,
      completed_at = now()
  WHERE id = p_command_id
    AND company_id = v_company_id
    AND status = 'started';

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('INVARIANT', 'write command not completable');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Transition matrix: approval vs immediate-post; drop empty-role wildcards
-- ---------------------------------------------------------------------------

-- Remove broad empty-role wildcards that let any member mutate.
DELETE FROM public.doc_state_transitions
WHERE doc_type = '*'
  AND (
    (from_state = 'draft' AND action IN ('submit', 'cancel'))
    OR (from_state = 'confirmed' AND action = 'post')
  );

-- Approval-path documents: draft → submit/cancel with domain roles.
INSERT INTO public.doc_state_transitions (doc_type, from_state, action, to_state, roles)
VALUES
  ('po', 'draft', 'submit', 'pending', ARRAY['buyer', 'admin']::text[]),
  ('po', 'draft', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('vendor_bill', 'draft', 'submit', 'pending', ARRAY['ap_clerk', 'admin']::text[]),
  ('vendor_bill', 'draft', 'cancel', 'cancelled', ARRAY['ap_clerk', 'admin']::text[]),
  ('vendor_payment', 'draft', 'submit', 'pending', ARRAY['ap_clerk', 'admin']::text[]),
  ('vendor_payment', 'draft', 'cancel', 'cancelled', ARRAY['ap_clerk', 'admin']::text[]),
  ('debit_note', 'draft', 'submit', 'pending', ARRAY['ap_clerk', 'admin']::text[]),
  ('debit_note', 'draft', 'cancel', 'cancelled', ARRAY['ap_clerk', 'admin']::text[]),
  ('quote', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('quote', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  ('so', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('so', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  ('customer_invoice', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('customer_invoice', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  ('customer_receipt', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('customer_receipt', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  ('credit_note', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('credit_note', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  -- Non-approval operational docs: submit/cancel with warehouse or accountant.
  ('pr', 'draft', 'submit', 'pending', ARRAY['buyer', 'admin']::text[]),
  ('pr', 'draft', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('grn', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('grn', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  ('dn', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('dn', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  ('journal_entry', 'draft', 'submit', 'pending', ARRAY['accountant', 'admin']::text[]),
  ('journal_entry', 'draft', 'cancel', 'cancelled', ARRAY['accountant', 'admin']::text[]),
  ('internal_transfer', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('internal_transfer', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  ('stock_adjustment', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('stock_adjustment', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  -- Shared approve/reject/post/reverse with explicit roles (keep * for these).
  ('*', 'pending', 'approve', 'confirmed', ARRAY['approver', 'admin']::text[]),
  ('*', 'pending', 'reject', 'draft', ARRAY['approver', 'admin']::text[]),
  ('*', 'confirmed', 'cancel', 'cancelled', ARRAY['approver', 'admin']::text[]),
  ('*', 'posted', 'reverse', 'cancelled', ARRAY['accountant', 'admin']::text[]),
  -- Confirmed → post by domain.
  ('grn', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('dn', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('vendor_bill', 'confirmed', 'post', 'posted', ARRAY['ap_clerk', 'accountant', 'admin']::text[]),
  ('vendor_payment', 'confirmed', 'post', 'posted', ARRAY['ap_clerk', 'accountant', 'admin']::text[]),
  ('vendor_return', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('debit_note', 'confirmed', 'post', 'posted', ARRAY['ap_clerk', 'accountant', 'admin']::text[]),
  ('customer_invoice', 'confirmed', 'post', 'posted', ARRAY['ar_clerk', 'accountant', 'admin']::text[]),
  ('customer_receipt', 'confirmed', 'post', 'posted', ARRAY['ar_clerk', 'accountant', 'admin']::text[]),
  ('customer_return', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('credit_note', 'confirmed', 'post', 'posted', ARRAY['ar_clerk', 'accountant', 'admin']::text[]),
  ('journal_entry', 'confirmed', 'post', 'posted', ARRAY['accountant', 'admin']::text[]),
  ('internal_transfer', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('stock_adjustment', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('po', 'confirmed', 'post', 'posted', ARRAY['buyer', 'accountant', 'admin']::text[]),
  ('quote', 'confirmed', 'post', 'posted', ARRAY['ar_clerk', 'accountant', 'admin']::text[]),
  ('so', 'confirmed', 'post', 'posted', ARRAY['ar_clerk', 'accountant', 'admin']::text[]),
  -- Immediate-post paths (draft → post) only where business permits.
  ('grn', 'draft', 'post', 'posted', ARRAY['warehouse', 'admin']::text[]),
  ('dn', 'draft', 'post', 'posted', ARRAY['warehouse', 'admin']::text[]),
  ('journal_entry', 'draft', 'post', 'posted', ARRAY['accountant', 'admin']::text[]),
  ('internal_transfer', 'draft', 'post', 'posted', ARRAY['warehouse', 'admin']::text[]),
  ('stock_adjustment', 'draft', 'post', 'posted', ARRAY['warehouse', 'admin']::text[])
ON CONFLICT (doc_type, from_state, action) DO UPDATE
SET to_state = EXCLUDED.to_state,
    roles = EXCLUDED.roles;

-- ---------------------------------------------------------------------------
-- 5. Harden assert_transition_legal (no client role trust)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.assert_transition_legal(text, text, text, text);

CREATE OR REPLACE FUNCTION public.assert_transition_legal(
  p_doc_type text,
  p_from_state text,
  p_action text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_transition public.doc_state_transitions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_transition
  FROM public.doc_state_transitions AS dst
  WHERE dst.from_state = p_from_state
    AND dst.action = p_action
    AND dst.doc_type IN (p_doc_type, '*')
  ORDER BY CASE WHEN dst.doc_type = p_doc_type THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      p_doc_type || ' ' || p_from_state || ' -> ' || p_action
    );
  END IF;

  IF cardinality(v_transition.roles) = 0 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'transition roles must be explicit'
    );
  END IF;

  IF NOT public.is_platform_admin()
    AND NOT public.has_company_role(VARIADIC v_transition.roles) THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'required company role missing');
  END IF;

  RETURN v_transition.to_state;
END;
$$;

-- Align stale-version message with WRITE: convention while keeping SQLSTATE 40001.
CREATE OR REPLACE FUNCTION public.assert_document_row_version(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_row_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    PERFORM public.raise_write_error('UNAUTHENTICATED');
  END IF;

  IF p_expected_row_version IS NULL OR p_expected_row_version < 1 THEN
    PERFORM public.raise_write_error('VALIDATION', 'expected_row_version required');
  END IF;

  EXECUTE format(
    'SELECT company_id, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_row_version
  USING p_doc_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'WRITE:STALE_VERSION:%', v_row_version
      USING ERRCODE = '40001';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Core transition / post (internal) + public idempotent entry points
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_document_core(
  p_doc_type text,
  p_doc_id text,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_state text;
  v_row_version integer;
  v_target_state text;
BEGIN
  PERFORM public.require_company_context();

  IF p_action = 'post' THEN
    PERFORM public.raise_write_error('VALIDATION', 'use post_document for posting');
  END IF;
  IF p_action = 'reverse' THEN
    PERFORM public.raise_write_error('VALIDATION', 'use reverse_document for reversal');
  END IF;

  EXECUTE format(
    'SELECT company_id, state, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) '
    || 'FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_row_version
  USING p_doc_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  v_target_state := public.assert_transition_legal(p_doc_type, v_state, p_action);

  EXECUTE format(
    'UPDATE public.%I SET state = $1 WHERE company_id = $2 AND id = $3',
    v_table
  )
  USING v_target_state, v_company_id, p_doc_id;

  IF p_reason IS NOT NULL THEN
    UPDATE public.audit_events
    SET reason = p_reason
    WHERE company_id = v_company_id
      AND doc_type = p_doc_type
      AND doc_id = p_doc_id
      AND at = (
        SELECT max(at)
        FROM public.audit_events
        WHERE company_id = v_company_id
          AND doc_type = p_doc_type
          AND doc_id = p_doc_id
      );
  END IF;

  EXECUTE format(
    'SELECT row_version FROM public.%I WHERE company_id = $1 AND id = $2',
    v_table
  )
  INTO v_row_version
  USING v_company_id, p_doc_id;

  RETURN jsonb_build_object(
    'id', p_doc_id,
    'state', v_target_state,
    'rowVersion', v_row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_document_core(
  p_doc_type text,
  p_doc_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_state text;
  v_date date;
  v_row_version integer;
  v_caller_company_id text;
  v_is_platform_admin boolean;
BEGIN
  PERFORM public.require_company_context();

  v_is_platform_admin := public.is_platform_admin();
  v_caller_company_id := public.my_company_id();

  EXECUTE format(
    'SELECT company_id, state, date, row_version FROM public.%I '
    || 'WHERE id = $1 AND ($2 OR company_id = $3) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_date, v_row_version
  USING p_doc_id, v_is_platform_admin, v_caller_company_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_state = 'draft' THEN
    IF NOT public.document_allows_immediate_post(p_doc_type) THEN
      PERFORM public.raise_write_error(
        'ILLEGAL_TRANSITION',
        'immediate post not permitted for ' || p_doc_type
      );
    END IF;
  ELSIF v_state <> 'confirmed' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only confirmed or immediate-post draft documents can be posted'
    );
  END IF;

  PERFORM public.assert_transition_legal(p_doc_type, v_state, 'post');

  BEGIN
    PERFORM public.assert_period_open(v_company_id, v_date, true);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%soft closed%' OR SQLERRM ILIKE '%hard closed%'
        OR SQLERRM ILIKE '%no fiscal period%' THEN
        PERFORM public.raise_write_error('PERIOD_CLOSED', SQLERRM);
      END IF;
      RAISE;
  END;

  CASE p_doc_type
    WHEN 'grn' THEN PERFORM public.post_goods_receipt(v_company_id, p_doc_id);
    WHEN 'vendor_bill' THEN PERFORM public.post_vendor_bill(v_company_id, p_doc_id);
    WHEN 'vendor_payment' THEN PERFORM public.post_vendor_payment(v_company_id, p_doc_id);
    WHEN 'dn' THEN PERFORM public.post_delivery_note(v_company_id, p_doc_id);
    WHEN 'customer_invoice' THEN PERFORM public.post_customer_invoice(v_company_id, p_doc_id);
    WHEN 'customer_receipt' THEN PERFORM public.post_customer_receipt(v_company_id, p_doc_id);
    WHEN 'vendor_return' THEN PERFORM public.post_vendor_return(v_company_id, p_doc_id);
    WHEN 'customer_return' THEN PERFORM public.post_customer_return(v_company_id, p_doc_id);
    WHEN 'internal_transfer' THEN PERFORM public.post_internal_transfer(v_company_id, p_doc_id);
    WHEN 'stock_adjustment' THEN PERFORM public.post_stock_adjustment(v_company_id, p_doc_id);
    WHEN 'journal_entry' THEN PERFORM public.post_journal_entry(v_company_id, p_doc_id);
    ELSE NULL;
  END CASE;

  EXECUTE format(
    'UPDATE public.%I SET state = ''posted'' WHERE company_id = $1 AND id = $2 '
    || 'RETURNING row_version',
    v_table
  )
  INTO v_row_version
  USING v_company_id, p_doc_id;

  RETURN jsonb_build_object(
    'id', p_doc_id,
    'state', 'posted',
    'rowVersion', v_row_version
  );
END;
$$;

-- Reverse posting: counter JE (swap debit/credit) + opposite stock moves,
-- then transition posted → cancelled in the same transaction.
CREATE OR REPLACE FUNCTION public.reverse_document_core(
  p_doc_type text,
  p_doc_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_state text;
  v_date date;
  v_row_version integer;
  v_journal public.journal_entries%ROWTYPE;
  v_reverse_journal_id text;
  v_line public.journal_entry_lines%ROWTYPE;
  v_move public.stock_moves%ROWTYPE;
  v_stock_move_ids text[] := ARRAY[]::text[];
  v_journal_ids text[] := ARRAY[]::text[];
  v_reverse_source_type text := 'reverse:' || p_doc_type;
BEGIN
  PERFORM public.require_company_context();
  PERFORM public.assert_write_capability('accountant');

  EXECUTE format(
    'SELECT company_id, state, date, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_date, v_row_version
  USING p_doc_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_state <> 'posted' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only posted documents can be reversed'
    );
  END IF;

  PERFORM public.assert_transition_legal(p_doc_type, v_state, 'reverse');

  BEGIN
    PERFORM public.assert_period_open(v_company_id, v_date, true);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%soft closed%' OR SQLERRM ILIKE '%hard closed%'
        OR SQLERRM ILIKE '%no fiscal period%' THEN
        PERFORM public.raise_write_error('PERIOD_CLOSED', SQLERRM);
      END IF;
      RAISE;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries AS je
    WHERE je.company_id = v_company_id
      AND je.source_type = v_reverse_source_type
      AND je.source_id = p_doc_id
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_moves AS sm
    WHERE sm.company_id = v_company_id
      AND sm.source_type = v_reverse_source_type
      AND sm.source_id = p_doc_id
  ) THEN
    PERFORM public.raise_write_error('DUPLICATE', 'document already reversed');
  END IF;

  -- Reverse posting journals sourced by this document.
  FOR v_journal IN
    SELECT *
    FROM public.journal_entries AS je
    WHERE je.company_id = v_company_id
      AND (
        (je.source_type = p_doc_type AND je.source_id = p_doc_id)
        OR (p_doc_type = 'journal_entry' AND je.id = p_doc_id)
      )
      AND je.state = 'posted'
    ORDER BY je.created_at, je.id
    FOR UPDATE
  LOOP
    v_reverse_journal_id := public.create_posting_journal(
      v_company_id,
      v_reverse_source_type,
      p_doc_id,
      current_date,
      v_journal.currency,
      'Reversal of ' || v_journal.number
    );

    FOR v_line IN
      SELECT *
      FROM public.journal_entry_lines AS jel
      WHERE jel.company_id = v_company_id
        AND jel.journal_entry_id = v_journal.id
      ORDER BY jel.id
    LOOP
      PERFORM public.add_journal_line(
        v_company_id,
        v_reverse_journal_id,
        v_line.account_id,
        coalesce(nullif(v_line.description, ''), 'Reversal'),
        v_line.credit,
        v_line.debit
      );
    END LOOP;

    PERFORM public.assert_journal_balanced(v_reverse_journal_id);
    v_journal_ids := array_append(v_journal_ids, v_reverse_journal_id);
  END LOOP;

  -- Opposite stock moves.
  FOR v_move IN
    SELECT *
    FROM public.stock_moves AS sm
    WHERE sm.company_id = v_company_id
      AND sm.source_type = p_doc_type
      AND sm.source_id = p_doc_id
    ORDER BY sm.created_at, sm.id
    FOR UPDATE
  LOOP
    v_stock_move_ids := array_append(
      v_stock_move_ids,
      public.record_stock_move(
        v_company_id,
        current_date,
        v_move.product_id,
        v_move.warehouse_id,
        CASE WHEN v_move.direction = 'in' THEN 'out' ELSE 'in' END,
        v_move.qty,
        v_move.cost_per_unit,
        coalesce(v_move.lot_number, ''),
        v_reverse_source_type,
        p_doc_id
      )
    );
  END LOOP;

  EXECUTE format(
    'UPDATE public.%I SET state = ''cancelled'' WHERE company_id = $1 AND id = $2 '
    || 'RETURNING row_version',
    v_table
  )
  INTO v_row_version
  USING v_company_id, p_doc_id;

  IF p_reason IS NOT NULL THEN
    UPDATE public.audit_events
    SET reason = p_reason
    WHERE company_id = v_company_id
      AND doc_type = p_doc_type
      AND doc_id = p_doc_id
      AND at = (
        SELECT max(at)
        FROM public.audit_events
        WHERE company_id = v_company_id
          AND doc_type = p_doc_type
          AND doc_id = p_doc_id
      );
  END IF;

  RETURN jsonb_build_object(
    'id', p_doc_id,
    'state', 'cancelled',
    'rowVersion', v_row_version,
    'postedEffects', jsonb_build_object(
      'journalEntryIds', to_jsonb(v_journal_ids),
      'stockMoveIds', to_jsonb(v_stock_move_ids)
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.transition_document(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.post_document(text, text, text);

CREATE OR REPLACE FUNCTION public.transition_document(
  p_doc_type text,
  p_doc_id text,
  p_action text,
  p_expected_row_version integer,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim jsonb;
  v_result jsonb;
  v_hash text;
BEGIN
  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'docType', p_doc_type,
      'docId', p_doc_id,
      'action', p_action,
      'expectedRowVersion', p_expected_row_version,
      'reason', p_reason
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'transition_document',
    v_hash,
    p_doc_type,
    p_doc_id
  );

  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.assert_document_row_version(
    p_doc_type, p_doc_id, p_expected_row_version
  );

  v_result := public.transition_document_core(
    p_doc_type, p_doc_id, p_action, p_reason
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_document(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim jsonb;
  v_result jsonb;
  v_hash text;
BEGIN
  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'docType', p_doc_type,
      'docId', p_doc_id,
      'expectedRowVersion', p_expected_row_version
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'post_document',
    v_hash,
    p_doc_type,
    p_doc_id
  );

  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.assert_document_row_version(
    p_doc_type, p_doc_id, p_expected_row_version
  );

  v_result := public.post_document_core(p_doc_type, p_doc_id);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_document(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim jsonb;
  v_result jsonb;
  v_hash text;
BEGIN
  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'docType', p_doc_type,
      'docId', p_doc_id,
      'expectedRowVersion', p_expected_row_version,
      'reason', p_reason
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'reverse_document',
    v_hash,
    p_doc_type,
    p_doc_id
  );

  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.assert_document_row_version(
    p_doc_type, p_doc_id, p_expected_row_version
  );

  v_result := public.reverse_document_core(p_doc_type, p_doc_id, p_reason);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Approval entry points: drop p_active_role; require version + idempotency
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_approval_request(text, text, text, integer);
DROP FUNCTION IF EXISTS public.resolve_approval_request(text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim jsonb;
  v_hash text;
  v_table text;
  v_company_id text;
  v_state text;
  v_amount numeric(18, 3);
  v_request_id text;
  v_first_step_id text;
  v_step_count integer;
  v_target jsonb;
  v_result jsonb;
  v_row_version integer;
BEGIN
  IF NOT public.document_uses_approval(p_doc_type) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'approval workflow is not supported for document type: ' || p_doc_type
    );
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'docType', p_doc_type,
      'docId', p_doc_id,
      'expectedRowVersion', p_expected_row_version
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'create_approval_request',
    v_hash,
    p_doc_type,
    p_doc_id
  );

  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.assert_document_row_version(
    p_doc_type, p_doc_id, p_expected_row_version
  );

  v_table := public.document_table_name(p_doc_type);

  EXECUTE format(
    'SELECT company_id, state, '
    || 'coalesce((to_jsonb(d) ->> ''total'')::numeric, '
    || '(to_jsonb(d) ->> ''amount'')::numeric, 0), row_version '
    || 'FROM public.%I AS d '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_amount, v_row_version
  USING p_doc_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;
  IF v_state <> 'draft' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only draft documents can enter approval'
    );
  END IF;

  v_target := public.transition_document_core(p_doc_type, p_doc_id, 'submit', NULL);

  INSERT INTO public.approval_requests (
    company_id, doc_type, doc_id, amount, requested_by
  )
  VALUES (v_company_id, p_doc_type, p_doc_id, v_amount, auth.uid())
  RETURNING id INTO v_request_id;

  INSERT INTO public.approval_steps (
    company_id, approval_request_id, approval_rule_id, step_order, required_roles
  )
  SELECT
    v_company_id,
    v_request_id,
    ar.id,
    row_number() OVER (ORDER BY ar.sequence, ar.min_amount, ar.id)::smallint,
    ar.approver_roles
  FROM public.approval_rules AS ar
  WHERE ar.company_id = v_company_id
    AND ar.doc_type = p_doc_type
    AND ar.active
    AND v_amount >= ar.min_amount
    AND (ar.max_amount IS NULL OR v_amount <= ar.max_amount)
  ORDER BY ar.sequence, ar.min_amount, ar.id;

  GET DIAGNOSTICS v_step_count = ROW_COUNT;

  IF v_step_count = 0 THEN
    -- Preserve M6 auto-confirm when no rule matches (still role-gated via
    -- assert_transition_legal on approve).
    v_target := public.transition_document_core(
      p_doc_type,
      p_doc_id,
      'approve',
      'No active approval rule matched'
    );

    UPDATE public.approval_requests
    SET status = 'auto_confirmed',
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_reason = 'No active approval rule matched'
    WHERE id = v_request_id;

    v_result := jsonb_build_object(
      'id', v_request_id,
      'status', 'auto_confirmed',
      'docState', v_target ->> 'state',
      'rowVersion', v_target -> 'rowVersion'
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  SELECT s.id INTO v_first_step_id
  FROM public.approval_steps AS s
  WHERE s.company_id = v_company_id
    AND s.approval_request_id = v_request_id
  ORDER BY s.step_order
  LIMIT 1;

  PERFORM public.create_step_notifications(v_request_id, v_first_step_id);

  v_result := jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'docState', v_target ->> 'state',
    'rowVersion', v_target -> 'rowVersion',
    'stepCount', v_step_count
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_approval_request(
  p_approval_request_id text,
  p_decision text,
  p_expected_row_version integer,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim jsonb;
  v_hash text;
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_steps%ROWTYPE;
  v_next_step_id text;
  v_target jsonb;
  v_result jsonb;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    PERFORM public.raise_write_error('VALIDATION', 'decision must be approved or rejected');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'approvalRequestId', p_approval_request_id,
      'decision', p_decision,
      'expectedRowVersion', p_expected_row_version,
      'reason', p_reason
    )
  );

  SELECT * INTO v_request
  FROM public.approval_requests
  WHERE id = p_approval_request_id
    AND (company_id = public.my_company_id() OR public.is_platform_admin())
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'approval request not found');
  END IF;

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'resolve_approval_request',
    v_hash,
    v_request.doc_type,
    v_request.doc_id
  );

  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  IF v_request.status <> 'pending' THEN
    PERFORM public.raise_write_error('CONFLICT', 'approval request is already resolved');
  END IF;

  PERFORM public.assert_document_row_version(
    v_request.doc_type, v_request.doc_id, p_expected_row_version
  );

  SELECT s.* INTO v_step
  FROM public.approval_steps AS s
  WHERE s.company_id = v_request.company_id
    AND s.approval_request_id = v_request.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.approval_decisions AS d
      WHERE d.company_id = s.company_id
        AND d.approval_step_id = s.id
    )
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('INVARIANT', 'approval request has no open step');
  END IF;

  IF NOT public.has_company_role(VARIADIC v_step.required_roles) THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'current company role cannot decide this approval step');
  END IF;

  INSERT INTO public.approval_decisions (
    company_id, approval_request_id, approval_step_id, decision, decided_by, reason
  )
  VALUES (
    v_request.company_id, v_request.id, v_step.id, p_decision, auth.uid(), p_reason
  );

  IF p_decision = 'rejected' THEN
    UPDATE public.approval_requests
    SET status = 'rejected',
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_reason = p_reason
    WHERE id = v_request.id;

    v_target := public.transition_document_core(
      v_request.doc_type, v_request.doc_id, 'reject', p_reason
    );
    v_result := jsonb_build_object(
      'id', v_request.id,
      'status', 'rejected',
      'document', v_target
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  SELECT s.id INTO v_next_step_id
  FROM public.approval_steps AS s
  WHERE s.company_id = v_request.company_id
    AND s.approval_request_id = v_request.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.approval_decisions AS d
      WHERE d.company_id = s.company_id
        AND d.approval_step_id = s.id
    )
  ORDER BY s.step_order
  LIMIT 1;

  IF v_next_step_id IS NOT NULL THEN
    PERFORM public.create_step_notifications(v_request.id, v_next_step_id);
    v_result := jsonb_build_object(
      'id', v_request.id,
      'status', 'pending',
      'nextStepId', v_next_step_id
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  UPDATE public.approval_requests
  SET status = 'approved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_reason = p_reason
  WHERE id = v_request.id;

  v_target := public.transition_document_core(
    v_request.doc_type, v_request.doc_id, 'approve', p_reason
  );
  v_result := jsonb_build_object(
    'id', v_request.id,
    'status', 'approved',
    'document', v_target
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Shared period-close helpers (M17 / schedules consume these)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.period_close_canonical_task_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'reconcile_bank',
    'review_stale_drafts',
    'unbilled_deliveries',
    'missing_vendor_bills',
    'uninvoiced_revenue',
    'depreciation_entries',
    'tax_validation',
    'intercompany_balances',
    'review_adjustments',
    'final_review'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.ensure_period_close_run(
  p_company_id text,
  p_fiscal_period_id text,
  p_started_by uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run_id text;
  v_actor uuid := coalesce(p_started_by, auth.uid());
BEGIN
  IF p_company_id IS NULL OR p_fiscal_period_id IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'company and fiscal period required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fiscal_periods AS fp
    WHERE fp.company_id = p_company_id
      AND fp.id = p_fiscal_period_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'fiscal period not found');
  END IF;

  INSERT INTO public.period_close_runs (
    company_id, fiscal_period_id, status, started_by, started_at
  )
  VALUES (
    p_company_id,
    p_fiscal_period_id,
    'open',
    v_actor,
    now()
  )
  ON CONFLICT (company_id, fiscal_period_id) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT pcr.id
    INTO v_run_id
    FROM public.period_close_runs AS pcr
    WHERE pcr.company_id = p_company_id
      AND pcr.fiscal_period_id = p_fiscal_period_id;
  END IF;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_period_close_tasks(p_run_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.period_close_runs%ROWTYPE;
  v_code text;
  v_seq integer := 0;
  v_inserted integer := 0;
  v_rowcount integer;
BEGIN
  SELECT * INTO v_run
  FROM public.period_close_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'period close run not found');
  END IF;

  FOREACH v_code IN ARRAY public.period_close_canonical_task_codes()
  LOOP
    v_seq := v_seq + 1;

    INSERT INTO public.period_close_tasks (
      company_id,
      period_close_run_id,
      code,
      name,
      sequence,
      status,
      detail
    )
    VALUES (
      v_run.company_id,
      v_run.id,
      v_code,
      initcap(replace(v_code, '_', ' ')),
      v_seq,
      CASE
        WHEN v_code = 'intercompany_balances' THEN 'skipped'
        ELSE 'pending'
      END,
      CASE
        WHEN v_code = 'intercompany_balances' THEN
          jsonb_build_object(
            'reason', 'no intercompany model in v1'
          )
        ELSE '{}'::jsonb
      END
    )
    ON CONFLICT (company_id, period_close_run_id, code) DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_inserted := v_inserted + v_rowcount;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Revoke direct document DML (headers, lines, allocations, links)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'purchase_requisitions', 'purchase_requisition_lines',
    'rfqs', 'rfq_sources', 'rfq_invited_suppliers', 'rfq_lines',
    'rfq_quotes', 'rfq_quote_lines', 'rfq_line_sources',
    'purchase_orders', 'purchase_order_lines',
    'goods_receipts', 'goods_receipt_lines',
    'vendor_bills', 'vendor_bill_lines',
    'vendor_payments', 'vendor_payment_allocations',
    'vendor_returns', 'vendor_return_lines',
    'debit_notes',
    'opportunities',
    'quotes', 'quote_lines',
    'sales_orders', 'sales_order_lines',
    'delivery_notes', 'delivery_note_lines',
    'customer_invoices', 'customer_invoice_lines',
    'customer_receipts', 'customer_receipt_allocations',
    'customer_returns', 'customer_return_lines',
    'credit_notes',
    'journal_entries', 'journal_entry_lines',
    'stock_adjustments', 'stock_adjustment_lines',
    'internal_transfers', 'internal_transfer_lines',
    'document_links',
    'stock_moves',
    'audit_events'
  ]
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated',
      v_table
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.raise_write_error(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_company_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_capability_roles(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_write_capability(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_uses_approval(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_allows_immediate_post(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_hash_from_json(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_write_command(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_write_command(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_transition_legal(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_document_row_version(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_document_core(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_document_core(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_document_core(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_document(text, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_document(text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_document(text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_approval_request(text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_approval_request(text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.period_close_canonical_task_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_period_close_run(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_period_close_tasks(text) FROM PUBLIC;

-- Internal cores stay DEFINER-only (no authenticated execute).
REVOKE ALL ON FUNCTION public.transition_document_core(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_document_core(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_document_core(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_write_command(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_write_command(text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.document_uses_approval(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_allows_immediate_post(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_capability_roles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_hash_from_json(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_write_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_document(text, text, text, integer, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_document(text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_document(text, text, integer, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_approval_request(text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_approval_request(text, text, integer, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.period_close_canonical_task_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_period_close_run(text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_period_close_tasks(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_document_row_version(text, text, integer)
  TO authenticated;
