-- M14 — P2P write RPCs (create / header edit / RFQ award).
-- Depends on M13 write-command foundation. Document DML remains revoked;
-- authenticated callers use these DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Shared JSON field helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.json_text(
  p_obj jsonb,
  p_key text,
  p_required boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  IF p_obj IS NULL OR NOT (p_obj ? p_key) OR jsonb_typeof(p_obj -> p_key) = 'null' THEN
    IF p_required THEN
      PERFORM public.raise_write_error('VALIDATION', p_key || ' is required');
    END IF;
    RETURN NULL;
  END IF;

  v := nullif(trim(p_obj ->> p_key), '');
  IF v IS NULL AND p_required THEN
    PERFORM public.raise_write_error('VALIDATION', p_key || ' is required');
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.json_date(
  p_obj jsonb,
  p_key text,
  p_required boolean DEFAULT true
)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := public.json_text(p_obj, p_key, p_required);
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v::date;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      PERFORM public.raise_write_error('VALIDATION', p_key || ' must be a date');
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.json_numeric(
  p_obj jsonb,
  p_key text,
  p_required boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := public.json_text(p_obj, p_key, p_required);
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v::numeric;
  EXCEPTION
    WHEN invalid_text_representation THEN
      PERFORM public.raise_write_error('VALIDATION', p_key || ' must be numeric');
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Result / approval / intent / link helpers (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.write_document_result(
  p_doc_type text,
  p_doc_id text,
  p_number text,
  p_state text,
  p_row_version integer,
  p_approval_request_id text DEFAULT NULL,
  p_extras jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  -- p_doc_type kept for call-site symmetry with other write helpers.
  IF p_doc_type IS NULL THEN
    NULL;
  END IF;

  v := jsonb_build_object(
    'id', p_doc_id,
    'number', p_number,
    'state', p_state,
    'rowVersion', p_row_version
  );

  IF p_approval_request_id IS NOT NULL THEN
    v := v || jsonb_build_object('approvalRequestId', p_approval_request_id);
  END IF;

  IF p_extras IS NOT NULL AND p_extras <> '{}'::jsonb THEN
    IF p_extras ? 'postedEffects' THEN
      v := v || jsonb_build_object('postedEffects', p_extras -> 'postedEffects');
    ELSE
      v := v || p_extras;
    END IF;
  END IF;

  RETURN v;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.collect_posted_effects(
  p_doc_type text,
  p_doc_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_journal_id text;
  v_stock_ids text[];
BEGIN
  SELECT je.id
  INTO v_journal_id
  FROM public.journal_entries AS je
  WHERE je.company_id = v_company_id
    AND je.source_type = p_doc_type
    AND je.source_id = p_doc_id
  ORDER BY je.created_at DESC
  LIMIT 1;

  SELECT coalesce(array_agg(sm.id ORDER BY sm.created_at, sm.id), ARRAY[]::text[])
  INTO v_stock_ids
  FROM public.stock_moves AS sm
  WHERE sm.company_id = v_company_id
    AND sm.source_type = p_doc_type
    AND sm.source_id = p_doc_id;

  IF v_journal_id IS NULL AND cardinality(v_stock_ids) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'journalEntryId', v_journal_id,
    'stockMoveIds', to_jsonb(v_stock_ids)
  ));
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

CREATE OR REPLACE FUNCTION public.insert_document_link(
  p_company_id text,
  p_from_doc_type text,
  p_from_doc_id text,
  p_from_line_id text,
  p_to_doc_type text,
  p_to_doc_id text,
  p_to_line_id text,
  p_qty numeric DEFAULT NULL,
  p_value_amount numeric DEFAULT NULL,
  p_value_currency text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id text;
BEGIN
  INSERT INTO public.document_links (
    company_id,
    from_doc_type,
    from_doc_id,
    from_line_id,
    to_doc_type,
    to_doc_id,
    to_line_id,
    qty,
    value_amount,
    value_currency,
    reason
  )
  VALUES (
    p_company_id,
    p_from_doc_type,
    p_from_doc_id,
    p_from_line_id,
    p_to_doc_type,
    p_to_doc_id,
    p_to_line_id,
    p_qty,
    p_value_amount,
    p_value_currency,
    p_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_company_product(
  p_company_id text,
  p_product_id text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_product_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.products AS p
    WHERE p.company_id = p_company_id
      AND p.id = p_product_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'product not found');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_create_intent(p_intent text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_intent IS NULL OR p_intent NOT IN ('save_draft', 'submit', 'post') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'intent must be save_draft, submit, or post'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_document_header (shared public RPC)
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.create_purchase_requisition(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_date date;
  v_needed_by date;
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_result jsonb;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('buyer');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_purchase_requisition', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_needed_by := public.json_date(p_header, 'neededBy', true);
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);
  v_number := public.next_document_number(
    v_ctx.company_id, 'pr', extract(year FROM v_date)::integer
  );

  INSERT INTO public.purchase_requisitions (
    company_id, number, requested_by, date, needed_by, state, notes
  )
  VALUES (
    v_ctx.company_id,
    v_number,
    auth.uid()::text,
    v_date,
    v_needed_by,
    'draft',
    v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    INSERT INTO public.purchase_requisition_lines (
      company_id, purchase_requisition_id, product_id, description,
      qty, unit_price, tax_code_id, discount, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'productId', true),
      public.json_text(v_line, 'description', true),
      public.json_numeric(v_line, 'qty', true),
      coalesce(public.json_numeric(v_line, 'unitPrice', false), 0),
      public.json_text(v_line, 'taxCodeId', false),
      coalesce(public.json_numeric(v_line, 'discount', false), 0),
      v_order
    );
  END LOOP;

  v_result := public.apply_create_intent('pr', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_rfq
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_rfq(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_date date;
  v_expected date;
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_result jsonb;
  v_parent jsonb;
  v_pr_id text;
  v_supplier_id text;
  v_invited jsonb;
  v_line_id text;
  v_pr_line record;
  v_has_payload_lines boolean;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('buyer');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;

  v_has_payload_lines := p_lines IS NOT NULL
    AND jsonb_typeof(p_lines) = 'array'
    AND jsonb_array_length(p_lines) > 0;

  IF NOT v_has_payload_lines
    AND (
      p_source IS NULL
      OR p_source -> 'parents' IS NULL
      OR jsonb_typeof(p_source -> 'parents') <> 'array'
      OR jsonb_array_length(p_source -> 'parents') = 0
    ) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'lines required unless adopting from purchase requisitions'
    );
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_rfq', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_expected := public.json_date(p_header, 'expectedQuoteBy', true);
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);
  v_number := public.next_document_number(
    v_ctx.company_id, 'rfq', extract(year FROM v_date)::integer
  );

  INSERT INTO public.rfqs (
    company_id, number, date, expected_quote_by, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_date, v_expected, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  -- Parent PRs → rfq_sources (+ copy lines when payload empty).
  IF p_source IS NOT NULL
    AND p_source -> 'parents' IS NOT NULL
    AND jsonb_typeof(p_source -> 'parents') = 'array' THEN
    FOR v_parent IN SELECT value FROM jsonb_array_elements(p_source -> 'parents')
    LOOP
      IF public.json_text(v_parent, 'docType', true) <> 'pr' THEN
        PERFORM public.raise_write_error('VALIDATION', 'rfq parents must be pr');
      END IF;
      v_pr_id := public.json_text(v_parent, 'docId', true);

      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_requisitions AS pr
        WHERE pr.company_id = v_ctx.company_id AND pr.id = v_pr_id
      ) THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'purchase requisition not found');
      END IF;

      INSERT INTO public.rfq_sources (company_id, rfq_id, purchase_requisition_id)
      VALUES (v_ctx.company_id, v_id, v_pr_id)
      ON CONFLICT (company_id, rfq_id, purchase_requisition_id) DO NOTHING;

      PERFORM public.insert_document_link(
        v_ctx.company_id, 'pr', v_pr_id, NULL, 'rfq', v_id, NULL,
        NULL, NULL, NULL, 'rfq_from_pr'
      );

      IF NOT v_has_payload_lines THEN
        FOR v_pr_line IN
          SELECT *
          FROM public.purchase_requisition_lines AS prl
          WHERE prl.company_id = v_ctx.company_id
            AND prl.purchase_requisition_id = v_pr_id
            AND (
              v_parent -> 'lineIds' IS NULL
              OR jsonb_typeof(v_parent -> 'lineIds') <> 'array'
              OR prl.id IN (
                SELECT jsonb_array_elements_text(v_parent -> 'lineIds')
              )
            )
          ORDER BY prl.line_order, prl.id
        LOOP
          v_order := v_order + 1;
          INSERT INTO public.rfq_lines (
            company_id, rfq_id, product_id, description, qty, line_order
          )
          VALUES (
            v_ctx.company_id, v_id, v_pr_line.product_id,
            v_pr_line.description, v_pr_line.qty, v_order
          )
          RETURNING id INTO v_line_id;

          INSERT INTO public.rfq_line_sources (
            company_id, rfq_line_id, purchase_requisition_line_id
          )
          VALUES (v_ctx.company_id, v_line_id, v_pr_line.id);
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF v_has_payload_lines THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_order := v_order + 1;
      PERFORM public.assert_company_product(
        v_ctx.company_id, public.json_text(v_line, 'productId', true)
      );

      INSERT INTO public.rfq_lines (
        company_id, rfq_id, product_id, description, qty, line_order
      )
      VALUES (
        v_ctx.company_id,
        v_id,
        public.json_text(v_line, 'productId', true),
        public.json_text(v_line, 'description', true),
        public.json_numeric(v_line, 'qty', true),
        v_order
      )
      RETURNING id INTO v_line_id;

      IF public.json_text(v_line, 'sourceLineId', false) IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.purchase_requisition_lines AS prl
          WHERE prl.company_id = v_ctx.company_id
            AND prl.id = public.json_text(v_line, 'sourceLineId', true)
        ) THEN
          PERFORM public.raise_write_error('NOT_FOUND', 'source line not found');
        END IF;

        INSERT INTO public.rfq_line_sources (
          company_id, rfq_line_id, purchase_requisition_line_id
        )
        VALUES (
          v_ctx.company_id, v_line_id, public.json_text(v_line, 'sourceLineId', true)
        );
      END IF;
    END LOOP;
  END IF;

  IF v_order = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_invited := p_header -> 'invitedSupplierIds';
  IF v_invited IS NOT NULL AND jsonb_typeof(v_invited) = 'array' THEN
    FOR v_supplier_id IN SELECT jsonb_array_elements_text(v_invited)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers AS s
        WHERE s.company_id = v_ctx.company_id AND s.id = v_supplier_id
      ) THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'supplier not found');
      END IF;

      INSERT INTO public.rfq_invited_suppliers (company_id, rfq_id, supplier_id)
      VALUES (v_ctx.company_id, v_id, v_supplier_id)
      ON CONFLICT (company_id, rfq_id, supplier_id) DO NOTHING;
    END LOOP;
  END IF;

  v_result := public.apply_create_intent('rfq', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_purchase_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_date date;
  v_expected date;
  v_notes text;
  v_supplier_id text;
  v_currency text;
  v_payment_term_id text;
  v_warehouse_id text;
  v_pr_id text;
  v_line jsonb;
  v_order integer := 0;
  v_line_id text;
  v_result jsonb;
  v_parent jsonb;
  v_from_type text;
  v_from_id text;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('buyer');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_purchase_order', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_supplier_id := public.json_text(p_header, 'supplierId', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_payment_term_id := public.json_text(p_header, 'paymentTermId', true);
  v_warehouse_id := public.json_text(p_header, 'warehouseId', true);
  v_date := public.json_date(p_header, 'date', true);
  v_expected := public.json_date(p_header, 'expectedDate', true);
  v_notes := public.json_text(p_header, 'notes', false);
  v_pr_id := public.json_text(p_header, 'prId', false);

  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers AS s
    WHERE s.company_id = v_ctx.company_id AND s.id = v_supplier_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'supplier not found');
  END IF;

  IF v_pr_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_requisitions AS pr
    WHERE pr.company_id = v_ctx.company_id AND pr.id = v_pr_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'purchase requisition not found');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'po', extract(year FROM v_date)::integer
  );

  INSERT INTO public.purchase_orders (
    company_id, number, supplier_id, pr_id, date, expected_date,
    currency, payment_term_id, warehouse_id, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_supplier_id, v_pr_id, v_date, v_expected,
    v_currency, v_payment_term_id, v_warehouse_id, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    INSERT INTO public.purchase_order_lines (
      company_id, purchase_order_id, product_id, description,
      qty, unit_price, tax_code_id, discount, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'productId', true),
      public.json_text(v_line, 'description', true),
      public.json_numeric(v_line, 'qty', true),
      public.json_numeric(v_line, 'unitPrice', true),
      public.json_text(v_line, 'taxCodeId', false),
      coalesce(public.json_numeric(v_line, 'discount', false), 0),
      v_order
    )
    RETURNING id INTO v_line_id;

    IF public.json_text(v_line, 'sourceLineId', false) IS NOT NULL THEN
      PERFORM public.insert_document_link(
        v_ctx.company_id,
        coalesce(public.json_text(v_line, 'sourceDocType', false), 'pr'),
        coalesce(public.json_text(v_line, 'sourceDocId', false), v_pr_id),
        public.json_text(v_line, 'sourceLineId', true),
        'po', v_id, v_line_id,
        public.json_numeric(v_line, 'qty', true),
        NULL, v_currency, 'po_line_adoption'
      );
    END IF;
  END LOOP;

  PERFORM public.calc_doc_totals('po', v_id, v_ctx.company_id);

  IF v_pr_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'pr', v_pr_id, NULL, 'po', v_id, NULL,
      NULL, NULL, NULL, 'po_from_pr'
    );
  END IF;

  IF p_source IS NOT NULL
    AND p_source -> 'parents' IS NOT NULL
    AND jsonb_typeof(p_source -> 'parents') = 'array' THEN
    FOR v_parent IN SELECT value FROM jsonb_array_elements(p_source -> 'parents')
    LOOP
      v_from_type := public.json_text(v_parent, 'docType', true);
      v_from_id := public.json_text(v_parent, 'docId', true);

      IF v_from_type NOT IN ('pr', 'rfq') THEN
        PERFORM public.raise_write_error('VALIDATION', 'po parents must be pr or rfq');
      END IF;

      IF v_from_type = 'pr' AND NOT EXISTS (
        SELECT 1 FROM public.purchase_requisitions AS pr
        WHERE pr.company_id = v_ctx.company_id AND pr.id = v_from_id
      ) THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'purchase requisition not found');
      END IF;

      IF v_from_type = 'rfq' AND NOT EXISTS (
        SELECT 1 FROM public.rfqs AS r
        WHERE r.company_id = v_ctx.company_id AND r.id = v_from_id
      ) THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'rfq not found');
      END IF;

      PERFORM public.insert_document_link(
        v_ctx.company_id, v_from_type, v_from_id, NULL, 'po', v_id, NULL,
        NULL, NULL, NULL, 'po_from_' || v_from_type
      );
    END LOOP;
  END IF;

  v_result := public.apply_create_intent('po', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_goods_receipt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_goods_receipt(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_po_id text;
  v_po public.purchase_orders%ROWTYPE;
  v_po_line public.purchase_order_lines%ROWTYPE;
  v_warehouse_id text;
  v_date date;
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_qty numeric(18, 6);
  v_remaining numeric(18, 6);
  v_line_id text;
  v_result jsonb;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('warehouse');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_goods_receipt', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_po_id := public.json_text(p_header, 'poId', true);
  SELECT * INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.company_id = v_ctx.company_id AND po.id = v_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'purchase order not found');
  END IF;

  v_warehouse_id := coalesce(
    public.json_text(p_header, 'warehouseId', false),
    v_po.warehouse_id
  );
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);
  v_number := public.next_document_number(
    v_ctx.company_id, 'grn', extract(year FROM v_date)::integer
  );

  INSERT INTO public.goods_receipts (
    company_id, number, po_id, supplier_id, warehouse_id, date, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_po.id, v_po.supplier_id,
    v_warehouse_id, v_date, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;

    SELECT * INTO v_po_line
    FROM public.purchase_order_lines AS pol
    WHERE pol.company_id = v_ctx.company_id
      AND pol.id = public.json_text(v_line, 'poLineId', true)
      AND pol.purchase_order_id = v_po.id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'purchase order line not found');
    END IF;

    v_qty := public.json_numeric(v_line, 'qtyReceived', true);
    v_remaining := v_po_line.qty - v_po_line.qty_received;
    IF v_qty > v_remaining + 0.000001 THEN
      PERFORM public.raise_write_error(
        'INVARIANT',
        'received qty exceeds remaining open quantity on po line'
      );
    END IF;

    INSERT INTO public.goods_receipt_lines (
      company_id, goods_receipt_id, po_line_id, product_id, description,
      qty, unit_price, tax_code_id, discount, qty_received, lot_number, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_po_line.id,
      v_po_line.product_id,
      coalesce(public.json_text(v_line, 'description', false), v_po_line.description),
      v_qty,
      coalesce(public.json_numeric(v_line, 'unitPrice', false), v_po_line.unit_price),
      coalesce(public.json_text(v_line, 'taxCodeId', false), v_po_line.tax_code_id),
      coalesce(public.json_numeric(v_line, 'discount', false), v_po_line.discount),
      v_qty,
      public.json_text(v_line, 'lotNumber', false),
      v_order
    )
    RETURNING id INTO v_line_id;

    PERFORM public.insert_document_link(
      v_ctx.company_id, 'po', v_po.id, v_po_line.id, 'grn', v_id, v_line_id,
      v_qty, NULL, v_po.currency, 'grn_from_po'
    );
  END LOOP;

  PERFORM public.insert_document_link(
    v_ctx.company_id, 'po', v_po.id, NULL, 'grn', v_id, NULL,
    NULL, NULL, NULL, 'grn_from_po'
  );

  v_result := public.apply_create_intent('grn', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_vendor_bill
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_vendor_bill(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_supplier_id text;
  v_invoice_number text;
  v_date date;
  v_due_date date;
  v_currency text;
  v_po_id text;
  v_grn_id text;
  v_line jsonb;
  v_order integer := 0;
  v_line_id text;
  v_result jsonb;
  v_product_id text;
  v_description text;
  v_po_line public.purchase_order_lines%ROWTYPE;
  v_grn_line public.goods_receipt_lines%ROWTYPE;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('ap_clerk');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_vendor_bill', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_supplier_id := public.json_text(p_header, 'supplierId', true);
  v_invoice_number := public.json_text(p_header, 'invoiceNumber', true);
  v_date := public.json_date(p_header, 'date', true);
  v_due_date := public.json_date(p_header, 'dueDate', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_po_id := public.json_text(p_header, 'poId', false);
  v_grn_id := public.json_text(p_header, 'grnId', false);

  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers AS s
    WHERE s.company_id = v_ctx.company_id AND s.id = v_supplier_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'supplier not found');
  END IF;

  IF v_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders AS po
    WHERE po.company_id = v_ctx.company_id AND po.id = v_po_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'purchase order not found');
  END IF;

  IF v_grn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.goods_receipts AS gr
    WHERE gr.company_id = v_ctx.company_id AND gr.id = v_grn_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'goods receipt not found');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'vendor_bill', extract(year FROM v_date)::integer
  );

  BEGIN
    INSERT INTO public.vendor_bills (
      company_id, number, supplier_id, po_id, grn_id,
      invoice_number, date, due_date, currency, state
    )
    VALUES (
      v_ctx.company_id, v_number, v_supplier_id, v_po_id, v_grn_id,
      v_invoice_number, v_date, v_due_date, v_currency, 'draft'
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM public.raise_write_error(
        'DUPLICATE',
        'invoice number already exists for supplier'
      );
  END;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    v_product_id := public.json_text(v_line, 'productId', false);
    v_description := public.json_text(v_line, 'description', false);

    IF public.json_text(v_line, 'poLineId', false) IS NOT NULL THEN
      SELECT * INTO v_po_line
      FROM public.purchase_order_lines AS pol
      WHERE pol.company_id = v_ctx.company_id
        AND pol.id = public.json_text(v_line, 'poLineId', true);

      IF NOT FOUND THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'purchase order line not found');
      END IF;
      v_product_id := coalesce(v_product_id, v_po_line.product_id);
      v_description := coalesce(v_description, v_po_line.description);
    END IF;

    IF public.json_text(v_line, 'grnLineId', false) IS NOT NULL THEN
      SELECT * INTO v_grn_line
      FROM public.goods_receipt_lines AS grl
      WHERE grl.company_id = v_ctx.company_id
        AND grl.id = public.json_text(v_line, 'grnLineId', true);

      IF NOT FOUND THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'goods receipt line not found');
      END IF;
      v_product_id := coalesce(v_product_id, v_grn_line.product_id);
      v_description := coalesce(v_description, v_grn_line.description);
    END IF;

    IF v_product_id IS NULL OR v_description IS NULL THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'productId and description required (or derive from po/grn line)'
      );
    END IF;

    PERFORM public.assert_company_product(v_ctx.company_id, v_product_id);

    INSERT INTO public.vendor_bill_lines (
      company_id, vendor_bill_id, po_line_id, grn_line_id,
      product_id, description, qty, unit_price, tax_code_id, discount, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'poLineId', false),
      public.json_text(v_line, 'grnLineId', false),
      v_product_id,
      v_description,
      public.json_numeric(v_line, 'qty', true),
      public.json_numeric(v_line, 'unitPrice', true),
      public.json_text(v_line, 'taxCodeId', false),
      coalesce(public.json_numeric(v_line, 'discount', false), 0),
      v_order
    )
    RETURNING id INTO v_line_id;
  END LOOP;

  PERFORM public.calc_doc_totals('vendor_bill', v_id, v_ctx.company_id);

  IF v_po_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'po', v_po_id, NULL, 'vendor_bill', v_id, NULL,
      NULL, NULL, NULL, 'bill_from_po'
    );
  END IF;
  IF v_grn_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'grn', v_grn_id, NULL, 'vendor_bill', v_id, NULL,
      NULL, NULL, NULL, 'bill_from_grn'
    );
  END IF;

  v_result := public.apply_create_intent('vendor_bill', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_vendor_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_vendor_payment(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_supplier_id text;
  v_bank_account_id text;
  v_date date;
  v_currency text;
  v_amount numeric(18, 3);
  v_method text;
  v_allocs jsonb;
  v_alloc jsonb;
  v_alloc_sum numeric(18, 3) := 0;
  v_bill_id text;
  v_alloc_amount numeric(18, 3);
  v_result jsonb;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('ap_clerk');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;

  v_allocs := coalesce(p_source -> 'allocations', p_header -> 'allocations');
  IF v_allocs IS NULL OR jsonb_typeof(v_allocs) <> 'array'
    OR jsonb_array_length(v_allocs) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'allocations required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_vendor_payment', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_supplier_id := public.json_text(p_header, 'supplierId', true);
  v_bank_account_id := public.json_text(p_header, 'bankAccountId', true);
  v_date := public.json_date(p_header, 'date', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_amount := public.json_numeric(p_header, 'amount', true);
  v_method := public.json_text(p_header, 'method', true);

  IF v_method NOT IN ('wire', 'cheque', 'cash') THEN
    PERFORM public.raise_write_error('VALIDATION', 'method must be wire, cheque, or cash');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers AS s
    WHERE s.company_id = v_ctx.company_id AND s.id = v_supplier_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'supplier not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts AS ba
    WHERE ba.company_id = v_ctx.company_id AND ba.id = v_bank_account_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank account not found');
  END IF;

  -- Validate allocations before insert.
  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocs)
  LOOP
    v_bill_id := public.json_text(v_alloc, 'billId', true);
    v_alloc_amount := public.json_numeric(v_alloc, 'amount', true);
    v_alloc_sum := v_alloc_sum + v_alloc_amount;

    IF NOT EXISTS (
      SELECT 1 FROM public.vendor_bills AS vb
      WHERE vb.company_id = v_ctx.company_id
        AND vb.id = v_bill_id
        AND vb.supplier_id = v_supplier_id
    ) THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'vendor bill not found');
    END IF;
  END LOOP;

  IF abs(v_alloc_sum - v_amount) > 0.001 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'allocation sum must equal payment amount'
    );
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'vendor_payment', extract(year FROM v_date)::integer
  );

  INSERT INTO public.vendor_payments (
    company_id, number, supplier_id, bank_account_id,
    date, currency, state, amount, method
  )
  VALUES (
    v_ctx.company_id, v_number, v_supplier_id, v_bank_account_id,
    v_date, v_currency, 'draft', v_amount, v_method
  )
  RETURNING id INTO v_id;

  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocs)
  LOOP
    INSERT INTO public.vendor_payment_allocations (
      company_id, vendor_payment_id, bill_id, amount
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_alloc, 'billId', true),
      public.json_numeric(v_alloc, 'amount', true)
    );

    PERFORM public.insert_document_link(
      v_ctx.company_id,
      'vendor_bill',
      public.json_text(v_alloc, 'billId', true),
      NULL,
      'vendor_payment',
      v_id,
      NULL,
      NULL,
      public.json_numeric(v_alloc, 'amount', true),
      v_currency,
      'payment_allocation'
    );
  END LOOP;

  v_result := public.apply_create_intent('vendor_payment', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_vendor_return
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_vendor_return(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_id text;
  v_number text;
  v_grn_id text;
  v_grn public.goods_receipts%ROWTYPE;
  v_grn_line public.goods_receipt_lines%ROWTYPE;
  v_date date;
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_qty numeric(18, 6);
  v_line_id text;
  v_result jsonb;
  v_reason text;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('warehouse');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one line is required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'create_vendor_return', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_grn_id := public.json_text(p_header, 'grnId', true);
  SELECT * INTO v_grn
  FROM public.goods_receipts AS gr
  WHERE gr.company_id = v_ctx.company_id AND gr.id = v_grn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'goods receipt not found');
  END IF;

  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);
  v_number := public.next_document_number(
    v_ctx.company_id, 'vendor_return', extract(year FROM v_date)::integer
  );

  INSERT INTO public.vendor_returns (
    company_id, number, grn_id, supplier_id, warehouse_id, date, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_grn.id, v_grn.supplier_id,
    v_grn.warehouse_id, v_date, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;

    SELECT * INTO v_grn_line
    FROM public.goods_receipt_lines AS grl
    WHERE grl.company_id = v_ctx.company_id
      AND grl.id = public.json_text(v_line, 'grnLineId', true)
      AND grl.goods_receipt_id = v_grn.id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'goods receipt line not found');
    END IF;

    v_qty := public.json_numeric(v_line, 'qty', true);
    IF v_qty > v_grn_line.qty_received + 0.000001 THEN
      PERFORM public.raise_write_error(
        'INVARIANT',
        'return qty exceeds goods receipt line quantity'
      );
    END IF;

    v_reason := public.json_text(v_line, 'reasonCode', true);
    IF v_reason NOT IN ('damaged', 'wrong_item', 'quality_fail', 'expired', 'other') THEN
      PERFORM public.raise_write_error('VALIDATION', 'invalid reasonCode');
    END IF;

    INSERT INTO public.vendor_return_lines (
      company_id, vendor_return_id, grn_line_id, product_id, description,
      qty, unit_price, tax_code_id, reason_code, notes, lot_number, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_grn_line.id,
      v_grn_line.product_id,
      coalesce(public.json_text(v_line, 'description', false), v_grn_line.description),
      v_qty,
      coalesce(public.json_numeric(v_line, 'unitPrice', false), v_grn_line.unit_price),
      coalesce(public.json_text(v_line, 'taxCodeId', false), v_grn_line.tax_code_id),
      v_reason,
      public.json_text(v_line, 'notes', false),
      coalesce(
        public.json_text(v_line, 'lotNumber', false),
        v_grn_line.lot_number
      ),
      v_order
    )
    RETURNING id INTO v_line_id;

    PERFORM public.insert_document_link(
      v_ctx.company_id, 'grn', v_grn.id, v_grn_line.id,
      'vendor_return', v_id, v_line_id,
      v_qty, NULL, NULL, 'vendor_return_from_grn'
    );
  END LOOP;

  PERFORM public.insert_document_link(
    v_ctx.company_id, 'grn', v_grn.id, NULL, 'vendor_return', v_id, NULL,
    NULL, NULL, NULL, 'vendor_return_from_grn'
  );

  v_result := public.apply_create_intent('vendor_return', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- award_rfq
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_rfq(
  p_rfq_id text,
  p_quote_id text,
  p_expected_row_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx record;
  v_hash text;
  v_claim jsonb;
  v_rfq public.rfqs%ROWTYPE;
  v_quote public.rfq_quotes%ROWTYPE;
  v_transition jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('buyer');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_rfq_id IS NULL OR p_quote_id IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'rfq id and quote id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'quoteId', p_quote_id,
      'expectedRowVersion', p_expected_row_version
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'award_rfq', v_hash, 'rfq', p_rfq_id
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.assert_document_row_version(
    'rfq', p_rfq_id, p_expected_row_version
  );

  SELECT * INTO v_rfq
  FROM public.rfqs AS r
  WHERE r.company_id = v_ctx.company_id AND r.id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'rfq not found');
  END IF;

  SELECT * INTO v_quote
  FROM public.rfq_quotes AS q
  WHERE q.company_id = v_ctx.company_id
    AND q.id = p_quote_id
    AND q.rfq_id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'rfq quote not found');
  END IF;

  UPDATE public.rfqs
  SET awarded_vendor_id = v_quote.vendor_id,
      awarded_quote_id = v_quote.id,
      awarded_at = now(),
      awarded_by = auth.uid()::text
  WHERE company_id = v_ctx.company_id
    AND id = p_rfq_id;

  v_transition := public.transition_document_core('rfq', p_rfq_id, 'award', NULL);

  SELECT * INTO v_rfq
  FROM public.rfqs AS r
  WHERE r.company_id = v_ctx.company_id AND r.id = p_rfq_id;

  v_result := public.write_document_result(
    'rfq',
    v_rfq.id,
    v_rfq.number,
    v_transition ->> 'state',
    (v_transition ->> 'rowVersion')::integer
  ) || jsonb_build_object(
    'awardedQuoteId', v_quote.id,
    'awardedVendorId', v_quote.vendor_id
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.json_text(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.json_date(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.json_numeric(jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_document_result(text, text, text, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_approval_request_core(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_posted_effects(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_create_intent(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_document_link(text, text, text, text, text, text, text, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_company_product(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_create_intent(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.json_text(jsonb, text, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.json_date(jsonb, text, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.json_numeric(jsonb, text, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.write_document_result(text, text, text, text, integer, text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_approval_request_core(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.collect_posted_effects(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_create_intent(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_document_link(text, text, text, text, text, text, text, numeric, numeric, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_company_product(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_create_intent(text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_purchase_requisition(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_rfq(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_purchase_order(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_goods_receipt(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vendor_payment(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vendor_return(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_rfq(text, text, integer, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_purchase_requisition(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_rfq(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_purchase_order(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_goods_receipt(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_vendor_payment(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_vendor_return(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.award_rfq(text, text, integer, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_document_header(text, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_requisition(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_rfq(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_goods_receipt(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_payment(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_return(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_rfq(text, text, integer, text) TO authenticated;
