-- M15 — Q2C write RPCs (create).
-- Depends on M14 P2P write RPCs (shared helpers) and M13 write-command foundation.
-- Document DML remains revoked; authenticated callers use these DEFINER RPCs only.
-- Reuses M14 helpers: json_text/json_date/json_numeric, write_document_result,
-- create_approval_request_core, apply_create_intent, insert_document_link,
-- assert_create_intent, assert_company_product, collect_posted_effects.

-- ---------------------------------------------------------------------------
-- create_quote
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
  PERFORM public.assert_write_capability('ar_clerk');
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
-- create_sales_order
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
  PERFORM public.assert_write_capability('ar_clerk');
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

-- ---------------------------------------------------------------------------
-- create_delivery_note
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_delivery_note(
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
  v_so_id text;
  v_so public.sales_orders%ROWTYPE;
  v_so_line public.sales_order_lines%ROWTYPE;
  v_warehouse_id text;
  v_date date;
  v_line jsonb;
  v_qty numeric(18, 6);
  v_remaining numeric(18, 6);
  v_line_id text;
  v_order integer := 0;
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
    p_idempotency_key, 'create_delivery_note', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_so_id := public.json_text(p_header, 'soId', true);
  SELECT * INTO v_so
  FROM public.sales_orders AS so
  WHERE so.company_id = v_ctx.company_id AND so.id = v_so_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'sales order not found');
  END IF;

  v_warehouse_id := coalesce(
    public.json_text(p_header, 'warehouseId', false),
    v_so.warehouse_id
  );
  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses AS w
    WHERE w.company_id = v_ctx.company_id AND w.id = v_warehouse_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'warehouse not found');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'dn', extract(year FROM v_date)::integer
  );

  INSERT INTO public.delivery_notes (
    company_id, number, so_id, customer_id, warehouse_id, date, state
  )
  VALUES (
    v_ctx.company_id, v_number, v_so.id, v_so.customer_id,
    v_warehouse_id, v_date, 'draft'
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    SELECT * INTO v_so_line
    FROM public.sales_order_lines AS sol
    WHERE sol.company_id = v_ctx.company_id
      AND sol.id = public.json_text(v_line, 'soLineId', true)
      AND sol.sales_order_id = v_so.id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'sales order line not found');
    END IF;

    v_qty := coalesce(
      public.json_numeric(v_line, 'qtyDelivered', false),
      public.json_numeric(v_line, 'qty', true)
    );
    v_remaining := v_so_line.qty - v_so_line.qty_delivered;
    IF v_qty > v_remaining + 0.000001 THEN
      PERFORM public.raise_write_error(
        'INVARIANT',
        'delivered qty exceeds remaining open quantity on so line'
      );
    END IF;

    INSERT INTO public.delivery_note_lines (
      company_id, delivery_note_id, so_line_id, product_id, description,
      qty, unit_price, tax_code_id, discount, qty_delivered, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_so_line.id,
      v_so_line.product_id,
      coalesce(public.json_text(v_line, 'description', false), v_so_line.description),
      v_qty,
      coalesce(public.json_numeric(v_line, 'unitPrice', false), v_so_line.unit_price),
      coalesce(public.json_text(v_line, 'taxCodeId', false), v_so_line.tax_code_id),
      coalesce(public.json_numeric(v_line, 'discount', false), v_so_line.discount),
      v_qty,
      v_order
    )
    RETURNING id INTO v_line_id;

    PERFORM public.insert_document_link(
      v_ctx.company_id, 'so', v_so.id, v_so_line.id, 'dn', v_id, v_line_id,
      v_qty, NULL, v_so.currency, 'dn_from_so'
    );
  END LOOP;

  PERFORM public.insert_document_link(
    v_ctx.company_id, 'so', v_so.id, NULL, 'dn', v_id, NULL,
    NULL, NULL, NULL, 'dn_from_so'
  );

  v_result := public.apply_create_intent('dn', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_customer_invoice
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_customer_invoice(
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
  v_date date;
  v_due_date date;
  v_currency text;
  v_so_id text;
  v_dn_id text;
  v_line jsonb;
  v_line_id text;
  v_result jsonb;
  v_product_id text;
  v_description text;
  v_order integer := 0;
  v_so_line public.sales_order_lines%ROWTYPE;
  v_dn_line public.delivery_note_lines%ROWTYPE;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('ar_clerk');
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
    p_idempotency_key, 'create_customer_invoice', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_customer_id := public.json_text(p_header, 'customerId', true);
  v_date := public.json_date(p_header, 'date', true);
  v_due_date := public.json_date(p_header, 'dueDate', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_so_id := public.json_text(p_header, 'soId', false);
  v_dn_id := public.json_text(p_header, 'dnId', false);

  IF NOT EXISTS (
    SELECT 1 FROM public.customers AS c
    WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'customer not found');
  END IF;

  IF v_so_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_orders AS so
    WHERE so.company_id = v_ctx.company_id AND so.id = v_so_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'sales order not found');
  END IF;

  IF v_dn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.delivery_notes AS dn
    WHERE dn.company_id = v_ctx.company_id AND dn.id = v_dn_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'delivery note not found');
  END IF;

  IF v_due_date < v_date THEN
    PERFORM public.raise_write_error('VALIDATION', 'dueDate must be on or after date');
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'customer_invoice', extract(year FROM v_date)::integer
  );

  INSERT INTO public.customer_invoices (
    company_id, number, customer_id, so_id, dn_id,
    date, due_date, currency, state
  )
  VALUES (
    v_ctx.company_id, v_number, v_customer_id, v_so_id, v_dn_id,
    v_date, v_due_date, v_currency, 'draft'
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    v_product_id := public.json_text(v_line, 'productId', false);
    v_description := public.json_text(v_line, 'description', false);

    IF public.json_text(v_line, 'soLineId', false) IS NOT NULL THEN
      SELECT * INTO v_so_line
      FROM public.sales_order_lines AS sol
      WHERE sol.company_id = v_ctx.company_id
        AND sol.id = public.json_text(v_line, 'soLineId', true);

      IF NOT FOUND THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'sales order line not found');
      END IF;
      v_product_id := coalesce(v_product_id, v_so_line.product_id);
      v_description := coalesce(v_description, v_so_line.description);
    END IF;

    IF public.json_text(v_line, 'dnLineId', false) IS NOT NULL THEN
      SELECT * INTO v_dn_line
      FROM public.delivery_note_lines AS dnl
      WHERE dnl.company_id = v_ctx.company_id
        AND dnl.id = public.json_text(v_line, 'dnLineId', true);

      IF NOT FOUND THEN
        PERFORM public.raise_write_error('NOT_FOUND', 'delivery note line not found');
      END IF;
      v_product_id := coalesce(v_product_id, v_dn_line.product_id);
      v_description := coalesce(v_description, v_dn_line.description);
    END IF;

    IF v_product_id IS NULL OR v_description IS NULL THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'productId and description required (or derive from so/dn line)'
      );
    END IF;

    PERFORM public.assert_company_product(v_ctx.company_id, v_product_id);

    INSERT INTO public.customer_invoice_lines (
      company_id, customer_invoice_id, so_line_id, dn_line_id,
      product_id, description, qty, unit_price, tax_code_id, discount, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_line, 'soLineId', false),
      public.json_text(v_line, 'dnLineId', false),
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

  PERFORM public.calc_doc_totals('customer_invoice', v_id, v_ctx.company_id);

  IF v_so_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'so', v_so_id, NULL, 'customer_invoice', v_id, NULL,
      NULL, NULL, NULL, 'invoice_from_so'
    );
  END IF;
  IF v_dn_id IS NOT NULL THEN
    PERFORM public.insert_document_link(
      v_ctx.company_id, 'dn', v_dn_id, NULL, 'customer_invoice', v_id, NULL,
      NULL, NULL, NULL, 'invoice_from_dn'
    );
  END IF;

  v_result := public.apply_create_intent('customer_invoice', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_customer_receipt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_customer_receipt(
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
  v_bank_account_id text;
  v_date date;
  v_currency text;
  v_amount numeric(18, 3);
  v_method text;
  v_allocs jsonb;
  v_alloc jsonb;
  v_alloc_sum numeric(18, 3) := 0;
  v_invoice_id text;
  v_alloc_amount numeric(18, 3);
  v_result jsonb;
BEGIN
  PERFORM public.assert_create_intent(p_intent);
  PERFORM public.assert_write_capability('ar_clerk');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;

  -- Prefer p_lines as [{invoiceId, amount}]; also accept header/source allocations.
  IF p_lines IS NOT NULL
    AND jsonb_typeof(p_lines) = 'array'
    AND jsonb_array_length(p_lines) > 0
    AND (p_lines -> 0) ? 'invoiceId' THEN
    v_allocs := p_lines;
  ELSE
    v_allocs := coalesce(p_source -> 'allocations', p_header -> 'allocations');
  END IF;

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
    p_idempotency_key, 'create_customer_receipt', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_customer_id := public.json_text(p_header, 'customerId', true);
  v_bank_account_id := public.json_text(p_header, 'bankAccountId', true);
  v_date := public.json_date(p_header, 'date', true);
  v_currency := public.json_text(p_header, 'currency', true);
  v_amount := public.json_numeric(p_header, 'amount', true);
  v_method := public.json_text(p_header, 'method', true);

  IF v_method NOT IN ('wire', 'cheque', 'cash', 'card') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'method must be wire, cheque, cash, or card'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers AS c
    WHERE c.company_id = v_ctx.company_id AND c.id = v_customer_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'customer not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts AS ba
    WHERE ba.company_id = v_ctx.company_id AND ba.id = v_bank_account_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank account not found');
  END IF;

  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocs)
  LOOP
    v_invoice_id := public.json_text(v_alloc, 'invoiceId', true);
    v_alloc_amount := public.json_numeric(v_alloc, 'amount', true);
    v_alloc_sum := v_alloc_sum + v_alloc_amount;

    IF NOT EXISTS (
      SELECT 1 FROM public.customer_invoices AS ci
      WHERE ci.company_id = v_ctx.company_id
        AND ci.id = v_invoice_id
        AND ci.customer_id = v_customer_id
    ) THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'customer invoice not found');
    END IF;
  END LOOP;

  IF abs(v_alloc_sum - v_amount) > 0.001 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'allocation sum must equal receipt amount'
    );
  END IF;

  v_number := public.next_document_number(
    v_ctx.company_id, 'customer_receipt', extract(year FROM v_date)::integer
  );

  INSERT INTO public.customer_receipts (
    company_id, number, customer_id, bank_account_id,
    date, currency, state, amount, method
  )
  VALUES (
    v_ctx.company_id, v_number, v_customer_id, v_bank_account_id,
    v_date, v_currency, 'draft', v_amount, v_method
  )
  RETURNING id INTO v_id;

  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocs)
  LOOP
    INSERT INTO public.customer_receipt_allocations (
      company_id, customer_receipt_id, invoice_id, amount
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      public.json_text(v_alloc, 'invoiceId', true),
      public.json_numeric(v_alloc, 'amount', true)
    );

    PERFORM public.insert_document_link(
      v_ctx.company_id,
      'customer_invoice',
      public.json_text(v_alloc, 'invoiceId', true),
      NULL,
      'customer_receipt',
      v_id,
      NULL,
      NULL,
      public.json_numeric(v_alloc, 'amount', true),
      v_currency,
      'receipt_allocation'
    );
  END LOOP;

  v_result := public.apply_create_intent('customer_receipt', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- create_customer_return
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_customer_return(
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
  v_dn_id text;
  v_dn public.delivery_notes%ROWTYPE;
  v_dn_line public.delivery_note_lines%ROWTYPE;
  v_date date;
  v_notes text;
  v_line jsonb;
  v_qty numeric(18, 6);
  v_line_id text;
  v_order integer := 0;
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
    p_idempotency_key, 'create_customer_return', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_dn_id := public.json_text(p_header, 'dnId', true);
  SELECT * INTO v_dn
  FROM public.delivery_notes AS dn
  WHERE dn.company_id = v_ctx.company_id AND dn.id = v_dn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'delivery note not found');
  END IF;

  v_date := coalesce(public.json_date(p_header, 'date', false), current_date);
  v_notes := public.json_text(p_header, 'notes', false);
  v_number := public.next_document_number(
    v_ctx.company_id, 'customer_return', extract(year FROM v_date)::integer
  );

  INSERT INTO public.customer_returns (
    company_id, number, dn_id, customer_id, warehouse_id, date, state, notes
  )
  VALUES (
    v_ctx.company_id, v_number, v_dn.id, v_dn.customer_id,
    v_dn.warehouse_id, v_date, 'draft', v_notes
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_order := v_order + 1;
    SELECT * INTO v_dn_line
    FROM public.delivery_note_lines AS dnl
    WHERE dnl.company_id = v_ctx.company_id
      AND dnl.id = public.json_text(v_line, 'dnLineId', true)
      AND dnl.delivery_note_id = v_dn.id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'delivery note line not found');
    END IF;

    v_qty := public.json_numeric(v_line, 'qty', true);
    IF v_qty > v_dn_line.qty_delivered + 0.000001 THEN
      PERFORM public.raise_write_error(
        'INVARIANT',
        'return qty exceeds delivery note line quantity'
      );
    END IF;

    v_reason := public.json_text(v_line, 'reasonCode', true);
    IF v_reason NOT IN (
      'damaged',
      'wrong_item',
      'not_as_described',
      'customer_dissatisfied',
      'expired',
      'other'
    ) THEN
      PERFORM public.raise_write_error('VALIDATION', 'invalid reasonCode');
    END IF;

    INSERT INTO public.customer_return_lines (
      company_id, customer_return_id, dn_line_id, product_id, description,
      qty, unit_price, tax_code_id, reason_code, notes, lot_number, line_order
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_dn_line.id,
      v_dn_line.product_id,
      coalesce(public.json_text(v_line, 'description', false), v_dn_line.description),
      v_qty,
      coalesce(public.json_numeric(v_line, 'unitPrice', false), v_dn_line.unit_price),
      coalesce(public.json_text(v_line, 'taxCodeId', false), v_dn_line.tax_code_id),
      v_reason,
      public.json_text(v_line, 'notes', false),
      public.json_text(v_line, 'lotNumber', false),
      v_order
    )
    RETURNING id INTO v_line_id;

    PERFORM public.insert_document_link(
      v_ctx.company_id, 'dn', v_dn.id, v_dn_line.id,
      'customer_return', v_id, v_line_id,
      v_qty, NULL, NULL, 'customer_return_from_dn'
    );
  END LOOP;

  PERFORM public.insert_document_link(
    v_ctx.company_id, 'dn', v_dn.id, NULL, 'customer_return', v_id, NULL,
    NULL, NULL, NULL, 'customer_return_from_dn'
  );

  v_result := public.apply_create_intent('customer_return', v_id, p_intent);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_delivery_note(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_invoice(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_receipt(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_return(text, text, jsonb, jsonb, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_delivery_note(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_customer_invoice(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_customer_receipt(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_customer_return(text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_quote(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_note(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_invoice(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_receipt(text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_return(text, text, jsonb, jsonb, jsonb) TO authenticated;
