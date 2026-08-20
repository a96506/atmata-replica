-- M16 — inventory / GL write RPCs (create).
-- Depends on M14 P2P write RPCs (shared helpers) and M13 write-command foundation.
-- Document DML remains revoked; authenticated callers use these DEFINER RPCs only.
-- Reuses M14 helpers — do NOT redefine:
--   json_text, json_date, json_numeric, write_document_result,
--   create_approval_request_core, apply_create_intent, insert_document_link,
--   assert_create_intent, assert_company_product, collect_posted_effects,
--   update_document_header.
-- Hard rules: no authenticated create_stock_move; posted JE header edits stay
-- draft-only via update_document_header.

-- ---------------------------------------------------------------------------
-- create_journal_entry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_journal_entry(
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
  v_currency text;
  v_notes text;
  v_reference text;
  v_description text;
  v_line jsonb;
  v_order integer := 0;
  v_account_id text;
  v_debit numeric(18, 3);
  v_credit numeric(18, 3);
  v_sum_debit numeric(18, 3) := 0;
  v_sum_credit numeric(18, 3) := 0;
  v_result jsonb;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) < 2 THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'at least two journal lines are required'
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
    p_idempotency_key, 'create_journal_entry', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_date := public.json_date(p_header, 'date', true);
  v_currency := coalesce(
    public.json_text(p_header, 'currency', false),
    (
      SELECT c.base_currency
      FROM public.companies AS c
      WHERE c.id = v_ctx.company_id
    )
  );
  v_notes := public.json_text(p_header, 'notes', false);
  v_reference := public.json_text(p_header, 'reference', false);

  -- journal_entries has description (no notes/reference columns).
  v_description := coalesce(v_notes, '');
  IF v_reference IS NOT NULL THEN
    IF v_description = '' THEN
      v_description := v_reference;
    ELSE
      v_description := v_description || ' · ' || v_reference;
    END IF;
  END IF;

  IF v_currency IS NULL OR v_currency NOT IN ('KWD', 'SAR', 'AED', 'USD') THEN
    PERFORM public.raise_write_error('VALIDATION', 'currency is required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.currencies AS cur
    WHERE cur.company_id = v_ctx.company_id AND cur.code = v_currency
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'currency not found');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'journal_entry', extract(year FROM v_date)::integer
  );

  INSERT INTO public.journal_entries (
    company_id, number, date, currency, state, description
  )
  VALUES (
    v_ctx.company_id, v_number, v_date, v_currency, 'draft', v_description
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    v_account_id := public.json_text(v_line, 'accountId', true);
    v_debit := coalesce(public.json_numeric(v_line, 'debit', false), 0);
    v_credit := coalesce(public.json_numeric(v_line, 'credit', false), 0);

    IF v_debit < 0 OR v_credit < 0 THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'debit and credit must be non-negative'
      );
    END IF;

    -- Exactly one side must be > 0.
    IF NOT (
      (v_debit > 0 AND v_credit = 0)
      OR (v_credit > 0 AND v_debit = 0)
    ) THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'each line must have exactly one of debit or credit greater than zero'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.accounts AS a
      WHERE a.company_id = v_ctx.company_id AND a.id = v_account_id
    ) THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'account not found');
    END IF;

    INSERT INTO public.journal_entry_lines (
      company_id, journal_entry_id, account_id, description,
      debit, credit, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_account_id,
      coalesce(public.json_text(v_line, 'description', false), ''),
      v_debit,
      v_credit,
      v_order
    );

    v_sum_debit := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
  END LOOP;

  IF v_sum_debit <> v_sum_credit OR v_sum_debit = 0 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'journal entry must be balanced with non-zero totals'
    );
  END IF;

  -- No direct stock_moves from JE create; posting (if any) is via apply_create_intent.
  v_result := public.apply_create_intent('journal_entry', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_internal_transfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_internal_transfer(
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
  v_from_wh text;
  v_to_wh text;
  v_date date;
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_qty numeric(18, 6);
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
    p_idempotency_key, 'create_internal_transfer', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_from_wh := public.json_text(p_header, 'fromWarehouseId', true);
  v_to_wh := public.json_text(p_header, 'toWarehouseId', true);
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);

  IF v_from_wh = v_to_wh THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'fromWarehouseId and toWarehouseId must differ'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses AS w
    WHERE w.company_id = v_ctx.company_id AND w.id = v_from_wh
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'from warehouse not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses AS w
    WHERE w.company_id = v_ctx.company_id AND w.id = v_to_wh
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'to warehouse not found');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'internal_transfer', extract(year FROM v_date)::integer
  );

  INSERT INTO public.internal_transfers (
    company_id, number, from_warehouse_id, to_warehouse_id, date, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_from_wh, v_to_wh, v_date, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    v_qty := public.json_numeric(v_line, 'qty', true);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      PERFORM public.raise_write_error('VALIDATION', 'qty must be greater than zero');
    END IF;

    INSERT INTO public.internal_transfer_lines (
      company_id, internal_transfer_id, product_id, qty, lot_number, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'productId', true),
      v_qty,
      public.json_text(v_line, 'lotNumber', false),
      v_order
    );
  END LOOP;

  -- Stock moves are created only by post_internal_transfer on post intent.
  v_result := public.apply_create_intent('internal_transfer', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_stock_adjustment
-- ---------------------------------------------------------------------------
-- document_uses_approval('stock_adjustment') is false; submit uses draft→pending
-- and post allows draft→post immediate. No approval_request path here.

CREATE OR REPLACE FUNCTION public.create_stock_adjustment(
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
  v_notes text;
  v_line jsonb;
  v_order integer := 0;
  v_warehouse_id text;
  v_qty_delta numeric(18, 6);
  v_reason text;
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
    p_idempotency_key, 'create_stock_adjustment', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);

  v_number := public.next_document_number(
    v_ctx.company_id, 'stock_adjustment', extract(year FROM v_date)::integer
  );

  INSERT INTO public.stock_adjustments (
    company_id, number, date, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_date, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    v_warehouse_id := public.json_text(v_line, 'warehouseId', true);
    v_qty_delta := public.json_numeric(v_line, 'qtyDelta', true);
    v_reason := public.json_text(v_line, 'reason', true);

    IF v_qty_delta IS NULL OR v_qty_delta = 0 THEN
      PERFORM public.raise_write_error('VALIDATION', 'qtyDelta must be non-zero');
    END IF;

    IF v_reason NOT IN ('cycle_count', 'damage', 'expiry', 'theft', 'other') THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'reason must be cycle_count, damage, expiry, theft, or other'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses AS w
      WHERE w.company_id = v_ctx.company_id AND w.id = v_warehouse_id
    ) THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'warehouse not found');
    END IF;

    INSERT INTO public.stock_adjustment_lines (
      company_id, stock_adjustment_id, product_id, warehouse_id,
      qty_delta, reason, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'productId', true),
      v_warehouse_id,
      v_qty_delta,
      v_reason,
      v_order
    );
  END LOOP;

  -- Stock moves / counter JE are created only by post_stock_adjustment on post.
  v_result := public.apply_create_intent('stock_adjustment', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_journal_entry(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_internal_transfer(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_stock_adjustment(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_journal_entry(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_internal_transfer(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_adjustment(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_journal_entry(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_internal_transfer(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_adjustment(text, text, jsonb, jsonb, jsonb) TO authenticated;
