-- Apply posted credit note balance to a posted customer invoice (ar_clerk).
-- Updates invoice.paid and credit_note.applied; links documents; writes audit events.

CREATE OR REPLACE FUNCTION public.apply_credit_to_invoice(
  p_invoice_id text,
  p_credit_note_id text,
  p_amount numeric,
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
  v_invoice public.customer_invoices%ROWTYPE;
  v_credit public.credit_notes%ROWTYPE;
  v_invoice_balance numeric(18, 3);
  v_credit_remaining numeric(18, 3);
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('ar_clerk');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_invoice_id IS NULL OR p_credit_note_id IS NULL THEN
    PERFORM public.raise_write_error('VALIDATION', 'invoice id and credit note id required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'amount must be positive');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'invoiceId', p_invoice_id,
      'creditNoteId', p_credit_note_id,
      'amount', p_amount
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key,
    'apply_credit_to_invoice',
    v_hash,
    'customer_invoice',
    p_invoice_id
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT * INTO v_invoice
  FROM public.customer_invoices AS ci
  WHERE ci.company_id = v_ctx.company_id
    AND ci.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'customer invoice not found');
  END IF;

  IF v_invoice.state <> 'posted' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only posted invoices accept credit applications'
    );
  END IF;

  v_invoice_balance := v_invoice.total - v_invoice.paid;
  IF v_invoice_balance <= 0 THEN
    PERFORM public.raise_write_error('INVARIANT', 'invoice has no outstanding balance');
  END IF;

  IF p_amount > v_invoice_balance + 0.001 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'credit amount exceeds invoice balance'
    );
  END IF;

  SELECT * INTO v_credit
  FROM public.credit_notes AS cn
  WHERE cn.company_id = v_ctx.company_id
    AND cn.id = p_credit_note_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'credit note not found');
  END IF;

  IF v_credit.state <> 'posted' THEN
    PERFORM public.raise_write_error(
      'ILLEGAL_TRANSITION',
      'only posted credit notes can be applied'
    );
  END IF;

  IF v_credit.customer_id <> v_invoice.customer_id THEN
    PERFORM public.raise_write_error('VALIDATION', 'credit note customer must match invoice');
  END IF;

  IF v_credit.currency <> v_invoice.currency THEN
    PERFORM public.raise_write_error('VALIDATION', 'credit note currency must match invoice');
  END IF;

  IF v_credit.invoice_id IS NOT NULL AND v_credit.invoice_id <> p_invoice_id THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'credit note is linked to a different invoice'
    );
  END IF;

  v_credit_remaining := v_credit.total - v_credit.applied;
  IF v_credit_remaining <= 0 THEN
    PERFORM public.raise_write_error('INVARIANT', 'credit note has no remaining balance');
  END IF;

  IF p_amount > v_credit_remaining + 0.001 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'credit amount exceeds credit note remaining balance'
    );
  END IF;

  UPDATE public.credit_notes
  SET
    applied = applied + p_amount,
    invoice_id = coalesce(invoice_id, p_invoice_id)
  WHERE company_id = v_ctx.company_id
    AND id = p_credit_note_id
    AND applied + p_amount <= total;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('INVARIANT', 'credit note apply update failed');
  END IF;

  UPDATE public.customer_invoices
  SET paid = paid + p_amount
  WHERE company_id = v_ctx.company_id
    AND id = p_invoice_id
    AND paid + p_amount <= total;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('INVARIANT', 'invoice paid update failed');
  END IF;

  PERFORM public.insert_document_link(
    v_ctx.company_id,
    'credit_note',
    p_credit_note_id,
    NULL,
    'customer_invoice',
    p_invoice_id,
    NULL,
    NULL,
    p_amount,
    v_invoice.currency,
    'credit_application'
  );

  INSERT INTO public.audit_events (
    company_id,
    doc_id,
    doc_type,
    from_state,
    to_state,
    "by",
    event_type,
    change_detail,
    reason
  )
  VALUES (
    v_ctx.company_id,
    p_invoice_id,
    'customer_invoice',
    v_invoice.state,
    v_invoice.state,
    auth.uid(),
    'field_change',
    jsonb_build_object(
      'creditNoteId', p_credit_note_id,
      'amount', p_amount,
      'paidBefore', v_invoice.paid,
      'paidAfter', v_invoice.paid + p_amount
    ),
    'credit applied'
  );

  INSERT INTO public.audit_events (
    company_id,
    doc_id,
    doc_type,
    from_state,
    to_state,
    "by",
    event_type,
    change_detail,
    reason
  )
  VALUES (
    v_ctx.company_id,
    p_credit_note_id,
    'credit_note',
    v_credit.state,
    v_credit.state,
    auth.uid(),
    'field_change',
    jsonb_build_object(
      'invoiceId', p_invoice_id,
      'amount', p_amount,
      'appliedBefore', v_credit.applied,
      'appliedAfter', v_credit.applied + p_amount
    ),
    'credit applied to invoice'
  );

  SELECT * INTO v_invoice
  FROM public.customer_invoices AS ci
  WHERE ci.company_id = v_ctx.company_id
    AND ci.id = p_invoice_id;

  SELECT * INTO v_credit
  FROM public.credit_notes AS cn
  WHERE cn.company_id = v_ctx.company_id
    AND cn.id = p_credit_note_id;

  v_result := jsonb_build_object(
    'id', v_invoice.id,
    'number', v_invoice.number,
    'state', v_invoice.state,
    'rowVersion', v_invoice.row_version,
    'paid', v_invoice.paid,
    'creditNoteId', v_credit.id,
    'creditNoteNumber', v_credit.number,
    'creditApplied', v_credit.applied,
    'amountApplied', p_amount
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text) TO authenticated;

ALTER FUNCTION public.apply_credit_to_invoice(text, text, numeric, text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text) FROM PUBLIC;
