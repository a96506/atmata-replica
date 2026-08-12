-- Central document invariants. UI state helpers remain for button affordances;
-- these functions are authoritative and block direct state mutation.

CREATE TABLE public.doc_state_transitions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_type text NOT NULL,
  from_state text NOT NULL,
  action text NOT NULL,
  to_state text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  UNIQUE (doc_type, from_state, action)
);

INSERT INTO public.doc_state_transitions (doc_type, from_state, action, to_state, roles)
VALUES
  ('*', 'draft', 'submit', 'pending', ARRAY[]::text[]),
  ('*', 'draft', 'cancel', 'cancelled', ARRAY[]::text[]),
  ('*', 'pending', 'approve', 'confirmed', ARRAY['approver', 'admin']::text[]),
  ('*', 'pending', 'reject', 'draft', ARRAY['approver', 'admin']::text[]),
  ('*', 'confirmed', 'post', 'posted', ARRAY[]::text[]),
  ('*', 'confirmed', 'cancel', 'cancelled', ARRAY['approver', 'admin']::text[]),
  ('*', 'posted', 'reverse', 'cancelled', ARRAY['accountant', 'admin']::text[]),
  ('po', 'draft', 'submit', 'pending', ARRAY['buyer', 'admin']::text[]),
  ('po', 'draft', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('vendor_bill', 'draft', 'submit', 'pending', ARRAY['ap_clerk', 'admin']::text[]),
  ('vendor_bill', 'draft', 'cancel', 'cancelled', ARRAY['ap_clerk', 'admin']::text[]),
  ('customer_invoice', 'draft', 'submit', 'pending', ARRAY['ar_clerk', 'admin']::text[]),
  ('customer_invoice', 'draft', 'cancel', 'cancelled', ARRAY['ar_clerk', 'admin']::text[]),
  ('rfq', 'draft', 'send', 'sent', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'draft', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'sent', 'record_quotes', 'quotes_received', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'sent', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'quotes_received', 'award', 'awarded', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'quotes_received', 'cancel', 'cancelled', ARRAY['buyer', 'admin']::text[]),
  ('rfq', 'awarded', 'close', 'closed', ARRAY['buyer', 'admin']::text[]),
  ('vendor_return', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('vendor_return', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  ('vendor_return', 'pending', 'approve', 'confirmed', ARRAY['approver', 'admin']::text[]),
  ('vendor_return', 'pending', 'reject', 'draft', ARRAY['approver', 'admin']::text[]),
  ('vendor_return', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('vendor_return', 'confirmed', 'cancel', 'cancelled', ARRAY['approver', 'admin']::text[]),
  ('vendor_return', 'posted', 'reverse', 'cancelled', ARRAY['accountant', 'admin']::text[]),
  ('customer_return', 'draft', 'submit', 'pending', ARRAY['warehouse', 'admin']::text[]),
  ('customer_return', 'draft', 'cancel', 'cancelled', ARRAY['warehouse', 'admin']::text[]),
  ('customer_return', 'pending', 'approve', 'confirmed', ARRAY['approver', 'admin']::text[]),
  ('customer_return', 'pending', 'reject', 'draft', ARRAY['approver', 'admin']::text[]),
  ('customer_return', 'confirmed', 'post', 'posted', ARRAY['warehouse', 'accountant', 'admin']::text[]),
  ('customer_return', 'confirmed', 'cancel', 'cancelled', ARRAY['approver', 'admin']::text[]),
  ('customer_return', 'posted', 'reverse', 'cancelled', ARRAY['accountant', 'admin']::text[])
ON CONFLICT (doc_type, from_state, action) DO NOTHING;

CREATE OR REPLACE FUNCTION public.document_table_name(p_doc_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_doc_type
    WHEN 'pr' THEN RETURN 'purchase_requisitions';
    WHEN 'rfq' THEN RETURN 'rfqs';
    WHEN 'po' THEN RETURN 'purchase_orders';
    WHEN 'grn' THEN RETURN 'goods_receipts';
    WHEN 'vendor_bill' THEN RETURN 'vendor_bills';
    WHEN 'vendor_payment' THEN RETURN 'vendor_payments';
    WHEN 'vendor_return' THEN RETURN 'vendor_returns';
    WHEN 'debit_note' THEN RETURN 'debit_notes';
    WHEN 'opportunity' THEN RETURN 'opportunities';
    WHEN 'quote' THEN RETURN 'quotes';
    WHEN 'so' THEN RETURN 'sales_orders';
    WHEN 'dn' THEN RETURN 'delivery_notes';
    WHEN 'customer_invoice' THEN RETURN 'customer_invoices';
    WHEN 'customer_receipt' THEN RETURN 'customer_receipts';
    WHEN 'customer_return' THEN RETURN 'customer_returns';
    WHEN 'credit_note' THEN RETURN 'credit_notes';
    WHEN 'journal_entry' THEN RETURN 'journal_entries';
    WHEN 'stock_adjustment' THEN RETURN 'stock_adjustments';
    WHEN 'internal_transfer' THEN RETURN 'internal_transfers';
    ELSE RAISE EXCEPTION 'unsupported document type: %', p_doc_type;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_company_id text,
  p_doc_type text,
  p_year integer DEFAULT extract(year FROM current_date)::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_padding smallint;
  v_next bigint;
BEGIN
  IF NOT public.is_platform_admin()
    AND p_company_id IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'cross-company number allocation denied';
  END IF;

  UPDATE public.document_sequences
  SET next_number = next_number + 1
  WHERE company_id = p_company_id
    AND doc_type = p_doc_type
    AND year = p_year
  RETURNING prefix, padding, next_number - 1
  INTO v_prefix, v_padding, v_next;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'missing document sequence for % / % / %',
      p_company_id, p_doc_type, p_year;
  END IF;

  RETURN v_prefix || '-' || p_year || '-' || lpad(v_next::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_period_open(
  p_company_id text,
  p_date date,
  p_allow_adjust boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT fp.status
  INTO v_status
  FROM public.fiscal_periods AS fp
  WHERE fp.company_id = p_company_id
    AND p_date BETWEEN fp."start" AND fp."end"
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no fiscal period for date %', p_date;
  END IF;

  IF v_status = 'hard_closed' THEN
    RAISE EXCEPTION 'fiscal period is hard closed';
  END IF;

  IF v_status = 'soft_closed'
    AND NOT (p_allow_adjust AND public.has_company_role('period_adjust', 'admin')) THEN
    RAISE EXCEPTION 'fiscal period is soft closed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_transition_legal(
  p_doc_type text,
  p_from_state text,
  p_action text,
  p_active_role text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
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
    RAISE EXCEPTION 'illegal transition: % % -> %', p_doc_type, p_from_state, p_action;
  END IF;

  IF cardinality(v_transition.roles) > 0
    AND NOT public.is_platform_admin() THEN
    IF p_active_role IS NOT NULL
      AND NOT (p_active_role = ANY (v_transition.roles))
      AND p_active_role <> 'admin' THEN
      RAISE EXCEPTION 'active role cannot perform transition';
    END IF;

    IF NOT public.has_company_role(VARIADIC v_transition.roles) THEN
      RAISE EXCEPTION 'required company role missing';
    END IF;
  END IF;

  RETURN v_transition.to_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calc_doc_totals(
  p_doc_type text,
  p_doc_id text,
  p_company_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_table text;
  v_line_table text;
  v_parent_key text;
  v_company_id text := coalesce(p_company_id, public.my_company_id());
  v_subtotal numeric(18,3);
  v_tax_total numeric(18,3);
BEGIN
  CASE p_doc_type
    WHEN 'po' THEN
      v_parent_table := 'purchase_orders';
      v_line_table := 'purchase_order_lines';
      v_parent_key := 'purchase_order_id';
    WHEN 'vendor_bill' THEN
      v_parent_table := 'vendor_bills';
      v_line_table := 'vendor_bill_lines';
      v_parent_key := 'vendor_bill_id';
    WHEN 'quote' THEN
      v_parent_table := 'quotes';
      v_line_table := 'quote_lines';
      v_parent_key := 'quote_id';
    WHEN 'so' THEN
      v_parent_table := 'sales_orders';
      v_line_table := 'sales_order_lines';
      v_parent_key := 'sales_order_id';
    WHEN 'customer_invoice' THEN
      v_parent_table := 'customer_invoices';
      v_line_table := 'customer_invoice_lines';
      v_parent_key := 'customer_invoice_id';
    ELSE
      RAISE EXCEPTION 'totals unsupported for document type %', p_doc_type;
  END CASE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company context required';
  END IF;

  EXECUTE format(
    'SELECT '
    || 'coalesce(sum(l.qty * l.unit_price - l.discount), 0), '
    || 'coalesce(sum((l.qty * l.unit_price - l.discount) * coalesce(tc.rate, 0)), 0) '
    || 'FROM public.%I AS l '
    || 'LEFT JOIN public.tax_codes AS tc '
    || 'ON tc.company_id = l.company_id AND tc.id = l.tax_code_id '
    || 'WHERE l.company_id = $1 AND l.%I = $2',
    v_line_table,
    v_parent_key
  )
  INTO v_subtotal, v_tax_total
  USING v_company_id, p_doc_id;

  EXECUTE format(
    'UPDATE public.%I '
    || 'SET subtotal = $1, tax_total = $2, total = $1 + $2 '
    || 'WHERE company_id = $3 AND id = $4',
    v_parent_table
  )
  USING v_subtotal, v_tax_total, v_company_id, p_doc_id;

  RETURN jsonb_build_object(
    'subtotal', v_subtotal,
    'taxTotal', v_tax_total,
    'total', v_subtotal + v_tax_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_document_totals_from_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record jsonb := to_jsonb(coalesce(NEW, OLD));
  v_doc_id text;
  v_company_id text;
BEGIN
  v_doc_id := v_record ->> TG_ARGV[1];
  v_company_id := v_record ->> 'company_id';
  PERFORM public.calc_doc_totals(TG_ARGV[0], v_doc_id, v_company_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_document_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events (
      company_id, doc_id, doc_type, from_state, to_state, "by"
    )
    VALUES (NEW.company_id, NEW.id, TG_ARGV[0], NULL, NEW.state, auth.uid());
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.audit_events (
      company_id, doc_id, doc_type, from_state, to_state, "by"
    )
    VALUES (NEW.company_id, NEW.id, TG_ARGV[0], OLD.state, NEW.state, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_document(
  p_doc_type text,
  p_doc_id text,
  p_action text,
  p_active_role text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_state text;
  v_target_state text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_platform_admin() AND public.my_company_id() IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF p_action = 'post' THEN
    RAISE EXCEPTION 'use post_document for posting';
  END IF;

  EXECUTE format(
    'SELECT company_id, state FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) '
    || 'FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state
  USING p_doc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  v_target_state := public.assert_transition_legal(
    p_doc_type, v_state, p_action, p_active_role
  );

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
      AND at = (SELECT max(at) FROM public.audit_events
                WHERE company_id = v_company_id
                  AND doc_type = p_doc_type
                  AND doc_id = p_doc_id);
  END IF;

  RETURN jsonb_build_object('id', p_doc_id, 'state', v_target_state);
END;
$$;

DO $$
DECLARE
  v_table text;
  v_doc_type text;
  v_pair text[];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['purchase_requisitions', 'pr'],
    ARRAY['rfqs', 'rfq'],
    ARRAY['purchase_orders', 'po'],
    ARRAY['goods_receipts', 'grn'],
    ARRAY['vendor_bills', 'vendor_bill'],
    ARRAY['vendor_payments', 'vendor_payment'],
    ARRAY['vendor_returns', 'vendor_return'],
    ARRAY['debit_notes', 'debit_note'],
    ARRAY['quotes', 'quote'],
    ARRAY['sales_orders', 'so'],
    ARRAY['delivery_notes', 'dn'],
    ARRAY['customer_invoices', 'customer_invoice'],
    ARRAY['customer_receipts', 'customer_receipt'],
    ARRAY['customer_returns', 'customer_return'],
    ARRAY['credit_notes', 'credit_note'],
    ARRAY['journal_entries', 'journal_entry'],
    ARRAY['stock_adjustments', 'stock_adjustment'],
    ARRAY['internal_transfers', 'internal_transfer']
  ]
  LOOP
    v_table := v_pair[1];
    v_doc_type := v_pair[2];
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()',
      v_table || '_row_version',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.audit_document_state(%L)',
      v_table || '_audit_state',
      v_table,
      v_doc_type
    );
  END LOOP;
END;
$$;

-- State, tenant identity, versioning, identifiers, and timestamps are
-- maintained by trusted database code. Runtime users may update only the
-- remaining business columns; SECURITY DEFINER transition/posting RPCs retain
-- owner privileges for state changes.
DO $$
DECLARE
  v_table text;
  v_table_oid oid;
  v_allowed_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'purchase_requisitions', 'rfqs', 'purchase_orders', 'goods_receipts',
    'vendor_bills', 'vendor_payments', 'vendor_returns', 'debit_notes',
    'quotes', 'sales_orders', 'delivery_notes', 'customer_invoices',
    'customer_receipts', 'customer_returns', 'credit_notes', 'journal_entries',
    'stock_adjustments', 'internal_transfers'
  ]
  LOOP
    SELECT c.oid
    INTO v_table_oid
    FROM pg_catalog.pg_class AS c
    INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind IN ('r', 'p');

    IF v_table_oid IS NULL THEN
      RAISE EXCEPTION 'document table not found: %', v_table;
    END IF;

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
    INTO v_allowed_columns
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = v_table_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname <> ALL (
        ARRAY['id', 'company_id', 'state', 'row_version', 'created_at', 'updated_at']
      );

    IF v_allowed_columns IS NULL THEN
      RAISE EXCEPTION 'no editable business columns found for %', v_table;
    END IF;

    EXECUTE format('REVOKE UPDATE ON public.%I FROM authenticated', v_table);
    EXECUTE format(
      'GRANT UPDATE (%s) ON public.%I TO authenticated',
      v_allowed_columns,
      v_table
    );
  END LOOP;
END;
$$;

CREATE TRIGGER purchase_order_lines_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION public.recalculate_document_totals_from_line('po', 'purchase_order_id');

CREATE TRIGGER vendor_bill_lines_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_bill_lines
FOR EACH ROW EXECUTE FUNCTION public.recalculate_document_totals_from_line('vendor_bill', 'vendor_bill_id');

CREATE TRIGGER quote_lines_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public.recalculate_document_totals_from_line('quote', 'quote_id');

CREATE TRIGGER sales_order_lines_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public.recalculate_document_totals_from_line('so', 'sales_order_id');

CREATE TRIGGER customer_invoice_lines_recalculate_totals
AFTER INSERT OR UPDATE OR DELETE ON public.customer_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.recalculate_document_totals_from_line('customer_invoice', 'customer_invoice_id');

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'companies', 'products', 'customers', 'suppliers', 'opportunities'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()',
      v_table || '_row_version',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.doc_state_transitions FROM authenticated;
GRANT SELECT ON public.doc_state_transitions TO authenticated;
REVOKE ALL ON FUNCTION public.document_table_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_document_number(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_period_open(text, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_transition_legal(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_row_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calc_doc_totals(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_document_totals_from_line() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_document_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_document(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_table_name(text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.next_document_number(text, text, integer) TO project_admin;
GRANT EXECUTE ON FUNCTION public.assert_period_open(text, date, boolean) TO project_admin;
GRANT EXECUTE ON FUNCTION public.assert_transition_legal(text, text, text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.calc_doc_totals(text, text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.transition_document(text, text, text, text, text) TO authenticated;
