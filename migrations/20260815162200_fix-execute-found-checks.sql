-- Fix: EXECUTE … INTO does not set FOUND (PostgreSQL plpgsql docs).
-- M14 helpers incorrectly treated every apply_create_intent / approval-core /
-- update_document_header lookup as NOT_FOUND. Check assigned columns instead.

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

CREATE OR REPLACE FUNCTION public.apply_create_intent(
  p_doc_type text,
  p_doc_id text,
  p_intent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_number text;
  v_state text;
  v_row_version integer;
  v_approval jsonb;
  v_post jsonb;
  v_effects jsonb;
  v_action text;
BEGIN
  IF p_intent IS NULL OR p_intent NOT IN ('save_draft', 'submit', 'post') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'intent must be save_draft, submit, or post'
    );
  END IF;

  EXECUTE format(
    'SELECT number, state, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin())',
    v_table
  )
  INTO v_number, v_state, v_row_version
  USING p_doc_id;

  -- EXECUTE does not set FOUND (PG docs); null targets ⇒ missing row.
  IF v_number IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF p_intent = 'save_draft' THEN
    RETURN public.write_document_result(
      p_doc_type, p_doc_id, v_number, v_state, v_row_version
    );
  END IF;

  IF p_intent = 'submit' THEN
    IF public.document_uses_approval(p_doc_type) THEN
      v_approval := public.create_approval_request_core(p_doc_type, p_doc_id);
      EXECUTE format(
        'SELECT number, state, row_version FROM public.%I WHERE id = $1',
        v_table
      )
      INTO v_number, v_state, v_row_version
      USING p_doc_id;

      RETURN public.write_document_result(
        p_doc_type,
        p_doc_id,
        v_number,
        coalesce(v_approval ->> 'docState', v_state),
        coalesce((v_approval ->> 'rowVersion')::integer, v_row_version),
        v_approval ->> 'id'
      );
    END IF;

    -- RFQ uses send as the draft→outbox analogue of submit.
    v_action := CASE WHEN p_doc_type = 'rfq' THEN 'send' ELSE 'submit' END;
    PERFORM public.transition_document_core(p_doc_type, p_doc_id, v_action, NULL);

    EXECUTE format(
      'SELECT number, state, row_version FROM public.%I WHERE id = $1',
      v_table
    )
    INTO v_number, v_state, v_row_version
    USING p_doc_id;

    RETURN public.write_document_result(
      p_doc_type, p_doc_id, v_number, v_state, v_row_version
    );
  END IF;

  -- post
  IF NOT public.document_allows_immediate_post(p_doc_type) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'immediate post not permitted for ' || p_doc_type
    );
  END IF;

  v_post := public.post_document_core(p_doc_type, p_doc_id);
  v_effects := public.collect_posted_effects(p_doc_type, p_doc_id);

  EXECUTE format(
    'SELECT number FROM public.%I WHERE id = $1',
    v_table
  )
  INTO v_number
  USING p_doc_id;

  RETURN public.write_document_result(
    p_doc_type,
    p_doc_id,
    v_number,
    v_post ->> 'state',
    (v_post ->> 'rowVersion')::integer,
    NULL,
    CASE
      WHEN v_effects IS NULL THEN NULL
      ELSE jsonb_build_object('postedEffects', v_effects)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_document_header(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer,
  p_idempotency_key text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_hash text;
  v_claim jsonb;
  v_table text;
  v_company_id text;
  v_state text;
  v_row_version integer;
  v_date date;
  v_notes text;
  v_sets text[] := ARRAY[]::text[];
  v_capability text;
  v_has_notes boolean;
  v_result jsonb;
  v_command_id text;
BEGIN
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    PERFORM public.raise_write_error('VALIDATION', 'patch required');
  END IF;

  -- Reject non-whitelist keys early.
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS k(key)
    WHERE k.key NOT IN ('date', 'notes')
  ) THEN
    PERFORM public.raise_write_error('VALIDATION', 'only date and notes may be patched');
  END IF;

  v_capability := CASE p_doc_type
    WHEN 'pr' THEN 'buyer'
    WHEN 'rfq' THEN 'buyer'
    WHEN 'po' THEN 'buyer'
    WHEN 'grn' THEN 'warehouse'
    WHEN 'vendor_bill' THEN 'ap_clerk'
    WHEN 'vendor_payment' THEN 'ap_clerk'
    WHEN 'vendor_return' THEN 'warehouse'
    WHEN 'quote' THEN 'ar_clerk'
    WHEN 'so' THEN 'ar_clerk'
    WHEN 'dn' THEN 'warehouse'
    WHEN 'customer_invoice' THEN 'ar_clerk'
    WHEN 'customer_receipt' THEN 'ar_clerk'
    WHEN 'customer_return' THEN 'warehouse'
    WHEN 'journal_entry' THEN 'accountant'
    WHEN 'internal_transfer' THEN 'warehouse'
    WHEN 'stock_adjustment' THEN 'warehouse'
    ELSE NULL
  END;

  IF v_capability IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'unsupported document type for header edit');
  END IF;

  PERFORM public.assert_write_capability(v_capability);

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'docType', p_doc_type,
      'docId', p_doc_id,
      'expectedRowVersion', p_expected_row_version,
      'patch', p_patch
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'update_document_header',
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
    'SELECT company_id, state, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_row_version
  USING p_doc_id;

  -- EXECUTE does not set FOUND; check assigned columns instead.
  IF v_company_id IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_state <> 'draft' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only draft documents can be edited'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = v_table
      AND c.column_name = 'notes'
  )
  INTO v_has_notes;

  IF p_patch ? 'date' THEN
    v_date := public.json_date(p_patch, 'date', true);
    v_sets := array_append(v_sets, format('date = %L::date', v_date));
  END IF;

  IF p_patch ? 'notes' THEN
    IF NOT v_has_notes THEN
      PERFORM public.raise_write_error('VALIDATION', 'notes not editable on ' || p_doc_type);
    END IF;
    v_notes := public.json_text(p_patch, 'notes', false);
    v_sets := array_append(v_sets, format('notes = %L', v_notes));
  END IF;

  IF cardinality(v_sets) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'patch required');
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %s WHERE company_id = $1 AND id = $2 '
    || 'RETURNING row_version',
    v_table,
    array_to_string(v_sets, ', ')
  )
  INTO v_row_version
  USING v_company_id, p_doc_id;

  v_command_id := v_claim ->> 'commandId';
  v_result := jsonb_build_object(
    'id', p_doc_id,
    'rowVersion', v_row_version
  );
  PERFORM public.complete_write_command(v_command_id, v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_purchase_requisition
-- ---------------------------------------------------------------------------


REVOKE ALL ON FUNCTION public.create_approval_request_core(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_approval_request_core(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_create_intent(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_create_intent(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) TO authenticated;
