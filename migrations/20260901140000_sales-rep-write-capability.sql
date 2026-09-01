-- Phase 1 (role-ux-plan): sales_rep write capability + dual-cap assert for quote/SO create.
-- Does not change RLS. Only RPC entry guards.

-- ---------------------------------------------------------------------------
-- write_capability_roles: add sales_rep arm (keep all existing)
-- ---------------------------------------------------------------------------

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
    WHEN 'sales_rep' THEN ARRAY['sales_rep', 'admin']::text[]
    WHEN 'admin' THEN ARRAY['admin']::text[]
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- assert_write_capability_any: succeed if ANY capability's roles match
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_write_capability_any(VARIADIC p_capabilities text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_capability text;
  v_roles text[];
BEGIN
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  IF p_capabilities IS NULL OR coalesce(cardinality(p_capabilities), 0) = 0 THEN
    PERFORM public.raise_write_error('FORBIDDEN', 'required company role missing');
  END IF;

  FOREACH v_capability IN ARRAY p_capabilities
  LOOP
    v_roles := public.write_capability_roles(v_capability);
    IF v_roles IS NOT NULL AND public.has_company_role(VARIADIC v_roles) THEN
      RETURN;
    END IF;
  END LOOP;

  PERFORM public.raise_write_error('FORBIDDEN', 'required company role missing');
END;
$$;

REVOKE ALL ON FUNCTION public.assert_write_capability_any(VARIADIC text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_write_capability_any(VARIADIC text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_quote: sales_rep OR ar_clerk (body from 20260815162100, assert only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_quote(
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
  v_customer_id text;
  v_currency text;
  v_date date;
  v_valid_until date;
  v_notes text;
  v_opportunity_id text;
  v_payment_term_id text;
  v_line jsonb;
  v_order integer := 0;
  v_result jsonb;
  v_customer public.customers%ROWTYPE;
  v_total numeric(18, 3);
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability_any(VARIADIC ARRAY['sales_rep', 'ar_clerk']);
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
    p_idempotency_key, 'create_quote', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_customer_id := public.json_text(p_header, 'customerId', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_valid_until := coalesce(
    public.json_date(p_header, 'validUntil', false),
    v_date + 30
  );
  v_notes := public.json_text(p_header, 'notes', false);
  v_opportunity_id := public.json_text(p_header, 'opportunityId', false);
  -- quotes have no payment_term_id column; validate if supplied.
  v_payment_term_id := public.json_text(p_header, 'paymentTermId', false);

  SELECT * INTO v_customer
  FROM public.customers AS c
  WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'customer not found');
  END IF;

  IF v_payment_term_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_terms AS pt
    WHERE pt.company_id = v_ctx.company_id AND pt.id = v_payment_term_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'payment term not found');
  END IF;

  IF v_opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.opportunities AS o
    WHERE o.company_id = v_ctx.company_id AND o.id = v_opportunity_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'opportunity not found');
  END IF;

  IF v_valid_until < v_date THEN
    PERFORM public.raise_write_error('VALIDATION', 'validUntil must be on or after date');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'quote', extract(year FROM v_date)::integer
  );

  INSERT INTO public.quotes (
    company_id, number, customer_id, opportunity_id,
    date, valid_until, currency, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_customer_id, v_opportunity_id,
    v_date, v_valid_until, v_currency, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    INSERT INTO public.quote_lines (
      company_id, quote_id, product_id, description,
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
    );
  END LOOP;

  PERFORM public.calc_doc_totals('quote', v_id, v_ctx.company_id);

  -- Credit hold: customers.payment_status = 'on_hold' (no credit_hold column).
  IF p_intent IN ('submit', 'post') THEN
    SELECT * INTO v_customer
    FROM public.customers AS c
    WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id
    FOR UPDATE;

    IF NOT v_customer.active OR v_customer.payment_status = 'on_hold' THEN
      PERFORM public.raise_write_error('FORBIDDEN', 'customer is on credit hold');
    END IF;

    SELECT q.total INTO v_total
    FROM public.quotes AS q
    WHERE q.company_id = v_ctx.company_id AND q.id = v_id;

    IF v_customer.exposure + coalesce(v_total, 0) > v_customer.credit_limit THEN
      PERFORM public.raise_write_error('FORBIDDEN', 'customer credit limit exceeded');
    END IF;
  END IF;

  v_result := public.apply_create_intent('quote', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_sales_order: sales_rep OR ar_clerk (body from 20260815162100, assert only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_sales_order(
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
  v_customer_id text;
  v_currency text;
  v_payment_term_id text;
  v_warehouse_id text;
  v_date date;
  v_promised date;
  v_quote_id text;
  v_line jsonb;
  v_line_id text;
  v_order integer := 0;
  v_result jsonb;
  v_customer public.customers%ROWTYPE;
  v_total numeric(18, 3);
  v_source_line_id text;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability_any(VARIADIC ARRAY['sales_rep', 'ar_clerk']);
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
    p_idempotency_key, 'create_sales_order', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_customer_id := public.json_text(p_header, 'customerId', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_payment_term_id := public.json_text(p_header, 'paymentTermId', false);
  v_warehouse_id := public.json_text(p_header, 'warehouseId', true);
  v_date := public.json_date(p_header, 'date', true);
  v_promised := coalesce(
    public.json_date(p_header, 'promisedDate', false),
    public.json_date(p_header, 'expectedDeliveryDate', false)
  );
  IF v_promised IS NULL THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'promisedDate (or expectedDeliveryDate) is required'
    );
  END IF;
  v_quote_id := public.json_text(p_header, 'quoteId', false);
  -- sales_orders have no notes / payment_term_id columns.

  SELECT * INTO v_customer
  FROM public.customers AS c
  WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'customer not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses AS w
    WHERE w.company_id = v_ctx.company_id AND w.id = v_warehouse_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'warehouse not found');
  END IF;

  IF v_payment_term_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_terms AS pt
    WHERE pt.company_id = v_ctx.company_id AND pt.id = v_payment_term_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'payment term not found');
  END IF;

  IF v_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotes AS q
    WHERE q.company_id = v_ctx.company_id AND q.id = v_quote_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'quote not found');
  END IF;

  IF v_promised < v_date THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'promisedDate must be on or after date'
    );
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'so', extract(year FROM v_date)::integer
  );

  INSERT INTO public.sales_orders (
    company_id, number, customer_id, quote_id, date,
    expected_delivery_date, currency, warehouse_id, state
  )
  VALUES (
    v_ctx.company_id, v_number, v_customer_id, v_quote_id, v_date,
    v_promised, v_currency, v_warehouse_id, 'draft'
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    PERFORM public.assert_company_product(
      v_ctx.company_id, public.json_text(v_line, 'productId', true)
    );

    INSERT INTO public.sales_order_lines (
      company_id, sales_order_id, product_id, description,
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

    v_source_line_id := public.json_text(v_line, 'sourceLineId', false);
    IF v_source_line_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.quote_lines AS ql
        WHERE ql.company_id = v_ctx.company_id
          AND ql.id = v_source_line_id
          AND (v_quote_id IS NULL OR ql.quote_id = v_quote_id)
      ) THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'source quote line not found');
      END IF;

      PERFORM public.insert_document_link(
        v_ctx.company_id,
        'quote',
        coalesce(
          public.json_text(v_line, 'sourceDocId', false),
          v_quote_id
        ),
        v_source_line_id,
        'so', v_id, v_line_id,
        public.json_numeric(v_line, 'qty', true),
        NULL, v_currency, 'so_line_adoption'
      );
    END IF;
  END LOOP;

  PERFORM public.calc_doc_totals('so', v_id, v_ctx.company_id);

  IF v_quote_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'quote', v_quote_id, NULL, 'so', v_id, NULL,
      NULL, NULL, NULL, 'so_from_quote'
    );
  END IF;

  IF p_intent IN ('submit', 'post') THEN
    SELECT * INTO v_customer
    FROM public.customers AS c
    WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id
    FOR UPDATE;

    IF NOT v_customer.active OR v_customer.payment_status = 'on_hold' THEN
      PERFORM public.raise_write_error('FORBIDDEN', 'customer is on credit hold');
    END IF;

    SELECT so.total INTO v_total
    FROM public.sales_orders AS so
    WHERE so.company_id = v_ctx.company_id AND so.id = v_id;

    IF v_customer.exposure + coalesce(v_total, 0) > v_customer.credit_limit THEN
      PERFORM public.raise_write_error('FORBIDDEN', 'customer credit limit exceeded');
    END IF;
  END IF;

  v_result := public.apply_create_intent('so', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) TO authenticated;
