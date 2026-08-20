-- Persist vendor_bills.source_ocr_job_id from create_vendor_bill.
-- Postgres cannot CHANGE argument types via CREATE OR REPLACE (docs): drop the
-- 5-arg overload, then recreate with optional trailing p_source_ocr_job_id.

DROP FUNCTION IF EXISTS public.create_vendor_bill(text, text, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_vendor_bill(
  p_idempotency_key text,
  p_intent text,
  p_header jsonb,
  p_lines jsonb,
  p_source jsonb DEFAULT NULL,
  p_source_ocr_job_id bigint DEFAULT NULL
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

  IF p_source_ocr_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.document_processing_jobs AS j
    WHERE j.company_id = v_ctx.company_id
      AND j.id = p_source_ocr_job_id
      AND j.kind = 'ocr_vendor_bill'
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'OCR job not found');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'intent', p_intent,
      'header', p_header,
      'lines', p_lines,
      'source', p_source,
      'sourceOcrJobId', p_source_ocr_job_id
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
      invoice_number, date, due_date, currency, state,
      source_ocr_job_id
    )
    VALUES (
      v_ctx.company_id, v_number, v_supplier_id, v_po_id, v_grn_id,
      v_invoice_number, v_date, v_due_date, v_currency, 'draft',
      p_source_ocr_job_id
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

REVOKE ALL ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb, bigint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb, bigint)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_bill(text, text, jsonb, jsonb, jsonb, bigint)
  TO authenticated;
