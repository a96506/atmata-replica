-- Atomic posting engine. Each RPC completes journal, stock, parent-line,
-- matching, and document-state effects in one PostgreSQL transaction.

CREATE OR REPLACE FUNCTION public.mapped_account(
  p_company_id text,
  p_mapping_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id text;
BEGIN
  SELECT am.account_id
  INTO v_account_id
  FROM public.account_mappings AS am
  WHERE am.company_id = p_company_id
    AND am.mapping_key = p_mapping_key;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'missing account mapping % for company %',
      p_mapping_key, p_company_id;
  END IF;

  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_posting_journal(
  p_company_id text,
  p_source_type text,
  p_source_id text,
  p_date date,
  p_currency text,
  p_description text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_id text;
BEGIN
  INSERT INTO public.journal_entries (
    company_id, number, date, currency, state, source_type, source_id, description
  )
  VALUES (
    p_company_id,
    public.next_document_number(p_company_id, 'journal_entry'),
    p_date,
    p_currency,
    'posted',
    p_source_type,
    p_source_id,
    p_description
  )
  RETURNING id INTO v_journal_id;

  RETURN v_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_journal_line(
  p_company_id text,
  p_journal_entry_id text,
  p_account_id text,
  p_description text,
  p_debit numeric,
  p_credit numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_debit < 0 OR p_credit < 0 OR (p_debit = 0) = (p_credit = 0) THEN
    RAISE EXCEPTION 'journal line must contain exactly one positive debit or credit';
  END IF;

  INSERT INTO public.journal_entry_lines (
    company_id, journal_entry_id, account_id, description, debit, credit
  )
  VALUES (
    p_company_id, p_journal_entry_id, p_account_id, p_description, p_debit, p_credit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_journal_balanced(p_journal_entry_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debit numeric(18,3);
  v_credit numeric(18,3);
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_entry_lines
  WHERE journal_entry_id = p_journal_entry_id;

  IF v_debit <> v_credit OR v_debit = 0 THEN
    RAISE EXCEPTION 'journal entry % is not balanced (% vs %)',
      p_journal_entry_id, v_debit, v_credit;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_stock_move(
  p_company_id text,
  p_date date,
  p_product_id text,
  p_warehouse_id text,
  p_direction text,
  p_qty numeric,
  p_cost_per_unit numeric,
  p_lot_number text,
  p_source_type text,
  p_source_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_move_id text;
  v_lot_number text := nullif(trim(p_lot_number), '');
  v_on_hand numeric(18,6);
BEGIN
  IF p_direction NOT IN ('in', 'out') OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid stock movement';
  END IF;

  IF v_lot_number IS NULL AND p_direction = 'out' THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_company_id || chr(31) || p_product_id || chr(31) || p_warehouse_id,
        0
      )
    );

    SELECT coalesce(sum(
      CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END
    ), 0)
    INTO v_on_hand
    FROM public.stock_moves AS sm
    WHERE sm.company_id = p_company_id
      AND sm.product_id = p_product_id
      AND sm.warehouse_id = p_warehouse_id
      AND sm.lot_number IS NULL;

    IF v_on_hand < p_qty THEN
      RAISE EXCEPTION 'insufficient non-lot stock for product % in warehouse %',
        p_product_id, p_warehouse_id;
    END IF;
  END IF;

  INSERT INTO public.stock_moves (
    company_id, number, date, product_id, warehouse_id, direction, qty,
    cost_per_unit, lot_number, source_type, source_id
  )
  VALUES (
    p_company_id,
    public.next_document_number(p_company_id, 'stock_move'),
    p_date,
    p_product_id,
    p_warehouse_id,
    p_direction,
    p_qty,
    p_cost_per_unit,
    v_lot_number,
    p_source_type,
    p_source_id
  )
  RETURNING id INTO v_stock_move_id;

  IF v_lot_number IS NOT NULL THEN
    IF p_direction = 'in' THEN
      INSERT INTO public.inventory_lots (
        company_id, product_id, warehouse_id, lot_number, on_hand
      )
      VALUES (
        p_company_id, p_product_id, p_warehouse_id, v_lot_number, p_qty
      )
      ON CONFLICT (company_id, product_id, warehouse_id, lot_number)
      DO UPDATE SET
        on_hand = public.inventory_lots.on_hand + EXCLUDED.on_hand,
        status = 'active';
    ELSE
      UPDATE public.inventory_lots
      SET on_hand = on_hand - p_qty,
          status = CASE WHEN on_hand - p_qty = 0 THEN 'depleted' ELSE 'active' END
      WHERE company_id = p_company_id
        AND product_id = p_product_id
        AND warehouse_id = p_warehouse_id
        AND lot_number = v_lot_number
        AND on_hand >= p_qty;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient stock for lot %', v_lot_number;
      END IF;
    END IF;
  END IF;

  RETURN v_stock_move_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_three_way_match(p_bill_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_status text := 'matched';
  v_reason text;
  v_has_grn boolean;
BEGIN
  SELECT company_id, grn_id IS NOT NULL
  INTO v_company_id, v_has_grn
  FROM public.vendor_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor bill not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_bill_lines AS vbl
    LEFT JOIN public.purchase_order_lines AS pol
      ON pol.company_id = vbl.company_id AND pol.id = vbl.po_line_id
    WHERE vbl.company_id = v_company_id
      AND vbl.vendor_bill_id = p_bill_id
      AND (
        vbl.po_line_id IS NULL
        OR pol.id IS NULL
        OR abs(vbl.unit_price - pol.unit_price) > 0.001
        OR vbl.qty > pol.qty + 0.000001
      )
  ) THEN
    v_status := 'discrepancy';
    v_reason := 'Bill line price or quantity differs from purchase order';
  ELSIF v_has_grn AND EXISTS (
    SELECT 1
    FROM public.vendor_bill_lines AS vbl
    LEFT JOIN public.goods_receipt_lines AS grl
      ON grl.company_id = vbl.company_id AND grl.id = vbl.grn_line_id
    WHERE vbl.company_id = v_company_id
      AND vbl.vendor_bill_id = p_bill_id
      AND (
        vbl.grn_line_id IS NULL
        OR grl.id IS NULL
        OR vbl.qty > grl.qty_received + 0.000001
      )
  ) THEN
    v_status := 'discrepancy';
    v_reason := 'Bill quantity exceeds goods receipt';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.vendor_bill_lines
    WHERE company_id = v_company_id AND vendor_bill_id = p_bill_id
  ) THEN
    v_status := 'review';
    v_reason := 'Bill has no lines';
  END IF;

  UPDATE public.vendor_bills
  SET three_way_match = v_status,
      discrepancy_reason = v_reason
  WHERE company_id = v_company_id
    AND id = p_bill_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_goods_receipt(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.goods_receipts%ROWTYPE;
  v_line public.goods_receipt_lines%ROWTYPE;
  v_journal_id text;
  v_subtotal numeric(18,3) := 0;
BEGIN
  IF NOT public.has_company_role('warehouse', 'admin') THEN
    RAISE EXCEPTION 'warehouse role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.goods_receipts
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.goods_receipt_lines
    WHERE company_id = p_company_id AND goods_receipt_id = p_document_id
  LOOP
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_doc.warehouse_id, 'in',
      v_line.qty_received, v_line.unit_price, v_line.lot_number, 'grn', v_doc.id
    );
    UPDATE public.purchase_order_lines
    SET qty_received = qty_received + v_line.qty_received
    WHERE company_id = p_company_id AND id = v_line.po_line_id;
    v_subtotal := v_subtotal + (v_line.qty_received * v_line.unit_price);
  END LOOP;

  IF v_subtotal > 0 THEN
    v_journal_id := public.create_posting_journal(
      p_company_id, 'grn', v_doc.id, v_doc.date,
      (SELECT base_currency FROM public.companies WHERE id = p_company_id),
      'Goods receipt ' || v_doc.number
    );
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory'),
      'Inventory received', v_subtotal, 0
    );
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id,
      public.mapped_account(p_company_id, 'goods_received_not_invoiced'),
      'Goods received not invoiced', 0, v_subtotal
    );
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_vendor_bill(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.vendor_bills%ROWTYPE;
  v_line public.vendor_bill_lines%ROWTYPE;
  v_journal_id text;
  v_match text;
BEGIN
  IF NOT public.has_company_role('ap_clerk', 'admin') THEN
    RAISE EXCEPTION 'AP clerk role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.vendor_bills
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  v_match := public.evaluate_three_way_match(v_doc.id);
  IF v_match = 'discrepancy' AND NOT public.has_company_role('approver', 'admin') THEN
    RAISE EXCEPTION 'three-way match discrepancy requires approver';
  END IF;

  FOR v_line IN
    SELECT * FROM public.vendor_bill_lines
    WHERE company_id = p_company_id AND vendor_bill_id = v_doc.id
  LOOP
    IF v_line.po_line_id IS NOT NULL THEN
      UPDATE public.purchase_order_lines
      SET qty_invoiced = qty_invoiced + v_line.qty
      WHERE company_id = p_company_id AND id = v_line.po_line_id;
    END IF;
  END LOOP;

  v_journal_id := public.create_posting_journal(
    p_company_id, 'vendor_bill', v_doc.id, v_doc.date, v_doc.currency,
    'Vendor bill ' || v_doc.number
  );
  IF v_doc.subtotal > 0 THEN
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(
        p_company_id,
        CASE
          WHEN v_doc.grn_id IS NULL THEN 'inventory'
          ELSE 'goods_received_not_invoiced'
        END
      ),
      'Vendor bill subtotal', v_doc.subtotal, 0
    );
  END IF;
  IF v_doc.tax_total > 0 THEN
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'input_vat'),
      'Input VAT', v_doc.tax_total, 0
    );
  END IF;
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_payable'),
    'Accounts payable', 0, v_doc.total
  );
  PERFORM public.assert_journal_balanced(v_journal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_vendor_payment(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.vendor_payments%ROWTYPE;
  v_allocation public.vendor_payment_allocations%ROWTYPE;
  v_allocated numeric(18,3);
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('ap_clerk', 'accountant', 'admin') THEN
    RAISE EXCEPTION 'AP clerk or accountant role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.vendor_payments
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  SELECT coalesce(sum(amount), 0)
  INTO v_allocated
  FROM public.vendor_payment_allocations
  WHERE company_id = p_company_id AND vendor_payment_id = v_doc.id;

  IF v_allocated <> v_doc.amount THEN
    RAISE EXCEPTION 'payment allocations must equal payment amount';
  END IF;

  FOR v_allocation IN
    SELECT * FROM public.vendor_payment_allocations
    WHERE company_id = p_company_id AND vendor_payment_id = v_doc.id
  LOOP
    UPDATE public.vendor_bills
    SET paid = paid + v_allocation.amount
    WHERE company_id = p_company_id
      AND id = v_allocation.bill_id
      AND paid + v_allocation.amount <= total;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment allocation exceeds bill balance';
    END IF;
  END LOOP;

  v_journal_id := public.create_posting_journal(
    p_company_id, 'vendor_payment', v_doc.id, v_doc.date, v_doc.currency,
    'Vendor payment ' || v_doc.number
  );
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_payable'),
    'Settle accounts payable', v_doc.amount, 0
  );
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'bank'),
    'Cash paid', 0, v_doc.amount
  );
  PERFORM public.assert_journal_balanced(v_journal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_delivery_note(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.delivery_notes%ROWTYPE;
  v_line public.delivery_note_lines%ROWTYPE;
  v_lot_tracked boolean;
BEGIN
  IF NOT public.has_company_role('warehouse', 'admin') THEN
    RAISE EXCEPTION 'warehouse role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.delivery_notes
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.delivery_note_lines
    WHERE company_id = p_company_id AND delivery_note_id = v_doc.id
  LOOP
    SELECT p.lot_tracked
    INTO v_lot_tracked
    FROM public.products AS p
    WHERE p.company_id = p_company_id
      AND p.id = v_line.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'delivery product % not found', v_line.product_id;
    END IF;

    IF v_lot_tracked THEN
      RAISE EXCEPTION
        'cannot value lot-tracked delivery product %: delivery lines do not identify an inventory lot',
        v_line.product_id;
    END IF;

    RAISE EXCEPTION
      'cannot value non-lot delivery product %: no reliable stock cost layer exists',
      v_line.product_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_invoice(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.customer_invoices%ROWTYPE;
  v_line public.customer_invoice_lines%ROWTYPE;
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('ar_clerk', 'admin') THEN
    RAISE EXCEPTION 'AR clerk role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.customer_invoices
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.customer_invoice_lines
    WHERE company_id = p_company_id AND customer_invoice_id = v_doc.id
  LOOP
    IF v_line.so_line_id IS NOT NULL THEN
      UPDATE public.sales_order_lines
      SET qty_invoiced = qty_invoiced + v_line.qty
      WHERE company_id = p_company_id AND id = v_line.so_line_id;
    END IF;
  END LOOP;

  v_journal_id := public.create_posting_journal(
    p_company_id, 'customer_invoice', v_doc.id, v_doc.date, v_doc.currency,
    'Customer invoice ' || v_doc.number
  );
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_receivable'),
    'Accounts receivable', v_doc.total, 0
  );
  IF v_doc.subtotal > 0 THEN
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'revenue'),
      'Revenue', 0, v_doc.subtotal
    );
  END IF;
  IF v_doc.tax_total > 0 THEN
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'output_vat'),
      'Output VAT', 0, v_doc.tax_total
    );
  END IF;
  PERFORM public.assert_journal_balanced(v_journal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_receipt(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.customer_receipts%ROWTYPE;
  v_allocation public.customer_receipt_allocations%ROWTYPE;
  v_allocated numeric(18,3);
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('ar_clerk', 'accountant', 'admin') THEN
    RAISE EXCEPTION 'AR clerk or accountant role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.customer_receipts
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  SELECT coalesce(sum(amount), 0)
  INTO v_allocated
  FROM public.customer_receipt_allocations
  WHERE company_id = p_company_id AND customer_receipt_id = v_doc.id;

  IF v_allocated <> v_doc.amount THEN
    RAISE EXCEPTION 'receipt allocations must equal receipt amount';
  END IF;

  FOR v_allocation IN
    SELECT * FROM public.customer_receipt_allocations
    WHERE company_id = p_company_id AND customer_receipt_id = v_doc.id
  LOOP
    UPDATE public.customer_invoices
    SET paid = paid + v_allocation.amount
    WHERE company_id = p_company_id
      AND id = v_allocation.invoice_id
      AND paid + v_allocation.amount <= total;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'receipt allocation exceeds invoice balance';
    END IF;
  END LOOP;

  v_journal_id := public.create_posting_journal(
    p_company_id, 'customer_receipt', v_doc.id, v_doc.date, v_doc.currency,
    'Customer receipt ' || v_doc.number
  );
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'bank'),
    'Cash received', v_doc.amount, 0
  );
  PERFORM public.add_journal_line(
    p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_receivable'),
    'Settle accounts receivable', 0, v_doc.amount
  );
  PERFORM public.assert_journal_balanced(v_journal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_vendor_return(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.vendor_returns%ROWTYPE;
  v_line public.vendor_return_lines%ROWTYPE;
  v_subtotal numeric(18,3) := 0;
  v_tax_total numeric(18,3) := 0;
  v_debit_note_id text;
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('warehouse', 'accountant', 'admin') THEN
    RAISE EXCEPTION 'warehouse or accountant role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.vendor_returns
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.vendor_return_lines
    WHERE company_id = p_company_id AND vendor_return_id = v_doc.id
  LOOP
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_doc.warehouse_id, 'out',
      v_line.qty, v_line.unit_price, v_line.lot_number, 'vendor_return', v_doc.id
    );
    v_subtotal := v_subtotal + v_line.qty * v_line.unit_price;
    v_tax_total := v_tax_total + (v_line.qty * v_line.unit_price - 0)
      * coalesce((
        SELECT rate FROM public.tax_codes
        WHERE company_id = p_company_id AND id = v_line.tax_code_id
      ), 0);
  END LOOP;

  INSERT INTO public.debit_notes (
    company_id, number, supplier_id, vendor_return_id, date, currency, state,
    subtotal, tax_total, total
  )
  VALUES (
    p_company_id,
    public.next_document_number(p_company_id, 'debit_note'),
    v_doc.supplier_id,
    v_doc.id,
    v_doc.date,
    (SELECT base_currency FROM public.companies WHERE id = p_company_id),
    'posted',
    v_subtotal,
    v_tax_total,
    v_subtotal + v_tax_total
  )
  RETURNING id INTO v_debit_note_id;

  UPDATE public.vendor_returns
  SET debit_note_id = v_debit_note_id
  WHERE company_id = p_company_id AND id = v_doc.id;

  IF v_subtotal + v_tax_total > 0 THEN
    v_journal_id := public.create_posting_journal(
      p_company_id, 'vendor_return', v_doc.id, v_doc.date,
      (SELECT base_currency FROM public.companies WHERE id = p_company_id),
      'Vendor return ' || v_doc.number
    );
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_payable'),
      'Vendor return claim', v_subtotal + v_tax_total, 0
    );
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory'),
      'Inventory returned', 0, v_subtotal
    );
    IF v_tax_total > 0 THEN
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'input_vat'),
        'Reverse input VAT', 0, v_tax_total
      );
    END IF;
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_return(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.customer_returns%ROWTYPE;
  v_line public.customer_return_lines%ROWTYPE;
  v_subtotal numeric(18,3) := 0;
  v_tax_total numeric(18,3) := 0;
  v_credit_note_id text;
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('warehouse', 'accountant', 'admin') THEN
    RAISE EXCEPTION 'warehouse or accountant role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.customer_returns
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.customer_return_lines
    WHERE company_id = p_company_id AND customer_return_id = v_doc.id
  LOOP
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_doc.warehouse_id, 'in',
      v_line.qty, v_line.unit_price, v_line.lot_number, 'customer_return', v_doc.id
    );
    v_subtotal := v_subtotal + v_line.qty * v_line.unit_price;
    v_tax_total := v_tax_total + (v_line.qty * v_line.unit_price)
      * coalesce((
        SELECT rate FROM public.tax_codes
        WHERE company_id = p_company_id AND id = v_line.tax_code_id
      ), 0);
  END LOOP;

  INSERT INTO public.credit_notes (
    company_id, number, customer_id, customer_return_id, date, currency, state,
    subtotal, tax_total, total
  )
  VALUES (
    p_company_id,
    public.next_document_number(p_company_id, 'credit_note'),
    v_doc.customer_id,
    v_doc.id,
    v_doc.date,
    (SELECT base_currency FROM public.companies WHERE id = p_company_id),
    'posted',
    v_subtotal,
    v_tax_total,
    v_subtotal + v_tax_total
  )
  RETURNING id INTO v_credit_note_id;

  UPDATE public.customer_returns
  SET credit_note_id = v_credit_note_id
  WHERE company_id = p_company_id AND id = v_doc.id;

  IF v_subtotal + v_tax_total > 0 THEN
    v_journal_id := public.create_posting_journal(
      p_company_id, 'customer_return', v_doc.id, v_doc.date,
      (SELECT base_currency FROM public.companies WHERE id = p_company_id),
      'Customer return ' || v_doc.number
    );
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'revenue'),
      'Reverse revenue', v_subtotal, 0
    );
    IF v_tax_total > 0 THEN
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'output_vat'),
        'Reverse output VAT', v_tax_total, 0
      );
    END IF;
    PERFORM public.add_journal_line(
      p_company_id, v_journal_id, public.mapped_account(p_company_id, 'accounts_receivable'),
      'Customer credit', 0, v_subtotal + v_tax_total
    );
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_internal_transfer(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.internal_transfers%ROWTYPE;
  v_line public.internal_transfer_lines%ROWTYPE;
BEGIN
  IF NOT public.has_company_role('warehouse', 'admin') THEN
    RAISE EXCEPTION 'warehouse role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.internal_transfers
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.internal_transfer_lines
    WHERE company_id = p_company_id AND internal_transfer_id = v_doc.id
  LOOP
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_doc.from_warehouse_id, 'out',
      v_line.qty, 0, v_line.lot_number, 'internal_transfer', v_doc.id
    );
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_doc.to_warehouse_id, 'in',
      v_line.qty, 0, v_line.lot_number, 'internal_transfer', v_doc.id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_adjustment(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc public.stock_adjustments%ROWTYPE;
  v_line public.stock_adjustment_lines%ROWTYPE;
  v_total numeric(18,3) := 0;
  v_journal_id text;
BEGIN
  IF NOT public.has_company_role('warehouse', 'accountant', 'admin') THEN
    RAISE EXCEPTION 'warehouse or accountant role required';
  END IF;

  SELECT * INTO v_doc
  FROM public.stock_adjustments
  WHERE company_id = p_company_id AND id = p_document_id
  FOR UPDATE;

  FOR v_line IN
    SELECT * FROM public.stock_adjustment_lines
    WHERE company_id = p_company_id AND stock_adjustment_id = v_doc.id
  LOOP
    PERFORM public.record_stock_move(
      p_company_id, v_doc.date, v_line.product_id, v_line.warehouse_id,
      CASE WHEN v_line.qty_delta > 0 THEN 'in' ELSE 'out' END,
      abs(v_line.qty_delta),
      coalesce((
        SELECT default_purchase_price FROM public.products
        WHERE company_id = p_company_id AND id = v_line.product_id
      ), 0),
      NULL,
      'stock_adjustment',
      v_doc.id
    );
    v_total := v_total + abs(v_line.qty_delta) * coalesce((
      SELECT default_purchase_price FROM public.products
      WHERE company_id = p_company_id AND id = v_line.product_id
    ), 0);
  END LOOP;

  IF v_total > 0 THEN
    v_journal_id := public.create_posting_journal(
      p_company_id, 'stock_adjustment', v_doc.id, v_doc.date,
      (SELECT base_currency FROM public.companies WHERE id = p_company_id),
      'Stock adjustment ' || v_doc.number
    );
    IF EXISTS (
      SELECT 1 FROM public.stock_adjustment_lines
      WHERE company_id = p_company_id
        AND stock_adjustment_id = v_doc.id
        AND qty_delta > 0
    ) THEN
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory'),
        'Inventory increase', v_total, 0
      );
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory_adjustment'),
        'Inventory adjustment', 0, v_total
      );
    ELSE
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory_adjustment'),
        'Inventory adjustment', v_total, 0
      );
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id, public.mapped_account(p_company_id, 'inventory'),
        'Inventory decrease', 0, v_total
      );
    END IF;
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_company_id text,
  p_document_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.has_company_role('accountant', 'admin') THEN
    RAISE EXCEPTION 'accountant role required';
  END IF;
  PERFORM public.assert_journal_balanced(p_document_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_document(
  p_doc_type text,
  p_doc_id text,
  p_active_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_state text;
  v_date date;
  v_caller_company_id text;
  v_is_platform_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_caller_company_id := public.my_company_id();

  IF NOT v_is_platform_admin AND v_caller_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  EXECUTE format(
    'SELECT company_id, state, date FROM public.%I '
    || 'WHERE id = $1 AND ($2 OR company_id = $3) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_date
  USING p_doc_id, v_is_platform_admin, v_caller_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF v_state <> 'confirmed' THEN
    RAISE EXCEPTION 'only confirmed documents can be posted';
  END IF;

  PERFORM public.assert_transition_legal(p_doc_type, v_state, 'post', p_active_role);
  PERFORM public.assert_period_open(v_company_id, v_date, true);

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
    'UPDATE public.%I SET state = ''posted'' WHERE company_id = $1 AND id = $2',
    v_table
  )
  USING v_company_id, p_doc_id;

  RETURN jsonb_build_object('id', p_doc_id, 'state', 'posted');
END;
$$;

REVOKE ALL ON FUNCTION public.mapped_account(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.create_posting_journal(text, text, text, date, text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_journal_line(text, text, text, text, numeric, numeric) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assert_journal_balanced(text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.record_stock_move(text, date, text, text, text, numeric, numeric, text, text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_three_way_match(text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_goods_receipt(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_vendor_bill(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_vendor_payment(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_delivery_note(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_customer_invoice(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_customer_receipt(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_vendor_return(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_customer_return(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_internal_transfer(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_stock_adjustment(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_journal_entry(text, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.post_document(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_document(text, text, text) TO authenticated;
