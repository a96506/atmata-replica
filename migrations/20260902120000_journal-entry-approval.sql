-- Wire journal_entry into the approval-rules workflow (same path as PO/SO):
-- document_uses_approval → create_approval_request(_core) matches amount bands →
-- pending → approve/reject → confirmed → post.
-- JE has no total/amount column; approval amount = sum(journal_entry_lines.debit).
-- Remove draft→post immediate path so posting cannot bypass approval bands.

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
      'credit_note',
      'journal_entry'
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
      'internal_transfer',
      'stock_adjustment'
    ]::text[]
  );
$$;

DELETE FROM public.doc_state_transitions
WHERE doc_type = 'journal_entry'
  AND from_state = 'draft'
  AND action = 'post';

-- Ensure demo seed bands exist (idempotent).
INSERT INTO public.approval_rules (
  id, company_id, doc_type, min_amount, max_amount, approver_roles, sequence, active
)
VALUES
  (
    'ar_je_1',
    'co_1',
    'journal_entry',
    0,
    NULL,
    ARRAY['approver', 'accountant']::text[],
    1,
    true
  ),
  (
    'ar_je_2',
    'co_1',
    'journal_entry',
    50000,
    NULL,
    ARRAY['admin']::text[],
    2,
    true
  )
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_approval_request_core(
  p_doc_type text,
  p_doc_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text;
  v_company_id text;
  v_state text;
  v_amount numeric(18, 3);
  v_request_id text;
  v_first_step_id text;
  v_step_count integer;
  v_target jsonb;
BEGIN
  IF NOT public.document_uses_approval(p_doc_type) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'approval workflow is not supported for document type: ' || p_doc_type
    );
  END IF;

  v_table := public.document_table_name(p_doc_type);

  EXECUTE format(
    'SELECT company_id, state, '
    || 'coalesce((to_jsonb(d) ->> ''total'')::numeric, '
    || '(to_jsonb(d) ->> ''amount'')::numeric, 0) '
    || 'FROM public.%I AS d '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_amount
  USING p_doc_id;

  -- EXECUTE does not set FOUND; check assigned columns instead.
  IF v_company_id IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;
  IF v_state <> 'draft' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only draft documents can enter approval'
    );
  END IF;

  -- journal_entries has no total/amount; use balanced debit total for bands.
  IF p_doc_type = 'journal_entry' THEN
    SELECT coalesce(sum(jel.debit), 0)
    INTO v_amount
    FROM public.journal_entry_lines AS jel
    WHERE jel.company_id = v_company_id
      AND jel.journal_entry_id = p_doc_id;
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

    RETURN jsonb_build_object(
      'id', v_request_id,
      'status', 'auto_confirmed',
      'docState', v_target ->> 'state',
      'rowVersion', v_target -> 'rowVersion'
    );
  END IF;

  SELECT s.id INTO v_first_step_id
  FROM public.approval_steps AS s
  WHERE s.company_id = v_company_id
    AND s.approval_request_id = v_request_id
  ORDER BY s.step_order
  LIMIT 1;

  PERFORM public.create_step_notifications(v_request_id, v_first_step_id);

  RETURN jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'docState', v_target ->> 'state',
    'rowVersion', v_target -> 'rowVersion',
    'stepCount', v_step_count
  );
END;
$$;

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

  -- EXECUTE does not set FOUND; check assigned columns instead.
  IF v_company_id IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;
  IF v_state <> 'draft' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only draft documents can enter approval'
    );
  END IF;

  IF p_doc_type = 'journal_entry' THEN
    SELECT coalesce(sum(jel.debit), 0)
    INTO v_amount
    FROM public.journal_entry_lines AS jel
    WHERE jel.company_id = v_company_id
      AND jel.journal_entry_id = p_doc_id;
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

REVOKE ALL ON FUNCTION public.create_approval_request_core(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_approval_request(text, text, integer, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_approval_request(text, text, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_uses_approval(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_allows_immediate_post(text) TO authenticated;
