-- Forward-only repairs for post-apply posting and document safety findings.

-- M5 granted catalog-derived business columns back to authenticated users on
-- journal_entries. Ledger entries are append-only to runtime callers: remove
-- both any table-level grant and every extant column-level UPDATE grant, while
-- leaving SELECT and INSERT privileges untouched.
REVOKE UPDATE ON TABLE public.journal_entries FROM authenticated;

DO $$
DECLARE
  v_column_name text;
BEGIN
  FOR v_column_name IN
    SELECT a.attname
    FROM pg_catalog.pg_attribute AS a
    INNER JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
    INNER JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'journal_entries'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.journal_entries FROM authenticated',
      v_column_name
    );
  END LOOP;
END;
$$;

-- Opportunities have their own stage lifecycle and do not implement the
-- generic state/date document contract used by transition_document and
-- post_document.
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

-- A GRN line may be invoiced across split lines and multiple bills. Compare
-- its received quantity and value with the current bill plus prior posted
-- bills, excluding the current bill from the prior-bill aggregate.
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
  SELECT vb.company_id, vb.grn_id IS NOT NULL
  INTO v_company_id, v_has_grn
  FROM public.vendor_bills AS vb
  WHERE vb.id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor bill not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_bill_lines AS vbl
    LEFT JOIN public.purchase_order_lines AS pol
      ON pol.company_id = vbl.company_id
      AND pol.id = vbl.po_line_id
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
    WITH billed_by_grn_line AS (
      SELECT
        candidate_vbl.grn_line_id,
        sum(candidate_vbl.qty) AS billed_qty,
        sum(candidate_vbl.qty * candidate_vbl.unit_price) AS billed_value
      FROM public.vendor_bill_lines AS candidate_vbl
      INNER JOIN public.vendor_bills AS candidate_vb
        ON candidate_vb.company_id = candidate_vbl.company_id
        AND candidate_vb.id = candidate_vbl.vendor_bill_id
      WHERE candidate_vbl.company_id = v_company_id
        AND (
          candidate_vbl.vendor_bill_id = p_bill_id
          OR (
            candidate_vb.id <> p_bill_id
            AND candidate_vb.state = 'posted'
          )
        )
      GROUP BY candidate_vbl.grn_line_id
    )
    SELECT 1
    FROM public.vendor_bill_lines AS current_vbl
    LEFT JOIN public.goods_receipt_lines AS grl
      ON grl.company_id = current_vbl.company_id
      AND grl.id = current_vbl.grn_line_id
    LEFT JOIN billed_by_grn_line AS billed
      ON billed.grn_line_id = current_vbl.grn_line_id
    WHERE current_vbl.company_id = v_company_id
      AND current_vbl.vendor_bill_id = p_bill_id
      AND (
        current_vbl.grn_line_id IS NULL
        OR grl.id IS NULL
        OR billed.billed_qty > grl.qty_received + 0.000001
        OR billed.billed_value > (grl.qty_received * grl.unit_price) + 0.001
      )
  ) THEN
    v_status := 'discrepancy';
    v_reason := 'Bill quantity or value exceeds goods receipt';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.vendor_bill_lines AS vbl
    WHERE vbl.company_id = v_company_id
      AND vbl.vendor_bill_id = p_bill_id
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
