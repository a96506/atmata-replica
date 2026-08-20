-- Fix: EXECUTE … INTO does not set FOUND (PostgreSQL plpgsql docs).
-- assert_document_row_version / transition_document_core / post_document_core /
-- reverse_document_core still used IF NOT FOUND after EXECUTE, so every
-- optimistic-lock / transition / post / reverse call raised WRITE:NOT_FOUND.
-- Same pattern as 20260815162200_fix-execute-found-checks.sql.

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

  -- EXECUTE does not set FOUND; check assigned columns instead.
  IF v_company_id IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'WRITE:STALE_VERSION:%', v_row_version
      USING ERRCODE = '40001';
  END IF;
END;
$$;

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

  IF v_company_id IS NULL THEN
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

  IF v_company_id IS NULL THEN
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

  IF v_company_id IS NULL THEN
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
