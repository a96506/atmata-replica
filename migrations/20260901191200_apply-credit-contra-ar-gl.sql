-- Optional contra-AR GL journal when applying credit to an invoice.
-- p_post_gl DEFAULT false: when true, posts balanced JE via create_posting_journal
-- + add_journal_line on mapped_account(..., 'accounts_receivable'):
--   debit AR (clear credit-note AR credit) / credit AR (settle invoice),
-- mirroring customer_receipt AR credit and credit-note AR credit patterns.

DROP FUNCTION IF EXISTS public.apply_credit_to_invoice(text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.apply_credit_to_invoice(
  p_invoice_id text,
  p_credit_note_id text,
  p_amount numeric,
  p_idempotency_key text,
  p_post_gl boolean DEFAULT false
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
  v_journal_id text;
  v_ar_account text;
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
      'amount', p_amount,
      'postGl', coalesce(p_post_gl, false)
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

  IF coalesce(p_post_gl, false) THEN
    v_ar_account := public.mapped_account(v_ctx.company_id, 'accounts_receivable');
    v_journal_id := public.create_posting_journal(
      v_ctx.company_id,
      'credit_application',
      coalesce(v_claim ->> 'commandId', p_idempotency_key),
      current_date,
      v_invoice.currency,
      'Apply credit ' || v_credit.number || ' to invoice ' || v_invoice.number
    );
    -- Debit AR: clear credit-note AR credit (contra / unapplied credit).
    PERFORM public.add_journal_line(
      v_ctx.company_id,
      v_journal_id,
      v_ar_account,
      'Clear credit note ' || v_credit.number,
      p_amount,
      0
    );
    -- Credit AR: settle invoice (mirror customer_receipt AR credit).
    PERFORM public.add_journal_line(
      v_ctx.company_id,
      v_journal_id,
      v_ar_account,
      'Settle invoice ' || v_invoice.number || ' with credit',
      0,
      p_amount
    );
    PERFORM public.assert_journal_balanced(v_journal_id);
  END IF;

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
      'paidAfter', v_invoice.paid + p_amount,
      'postGl', coalesce(p_post_gl, false),
      'journalEntryId', v_journal_id
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
      'appliedAfter', v_credit.applied + p_amount,
      'postGl', coalesce(p_post_gl, false),
      'journalEntryId', v_journal_id
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
    'amountApplied', p_amount,
    'postGl', coalesce(p_post_gl, false)
  );

  IF v_journal_id IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('journalEntryId', v_journal_id);
  END IF;

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text, boolean) TO authenticated;

ALTER FUNCTION public.apply_credit_to_invoice(text, text, numeric, text, boolean) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.apply_credit_to_invoice(text, text, numeric, text, boolean) FROM PUBLIC;
