-- M7: approval workflow, in-app notifications, and database-owned guards.
-- This migration deliberately covers only mechanics supported by M1-M6. Cost
-- valuation, lot availability, FX conversion, and payment allocation policies
-- remain outside this engine because their source-of-truth mechanics are not
-- modeled completely enough to enforce them safely.

CREATE TABLE public.approval_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  doc_id text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'auto_confirmed')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_reason text,
  UNIQUE (company_id, id),
  CHECK (
    (status = 'pending' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX approval_requests_one_pending_document_idx
  ON public.approval_requests(company_id, doc_type, doc_id)
  WHERE status = 'pending';

CREATE INDEX approval_requests_document_idx
  ON public.approval_requests(company_id, doc_type, doc_id, requested_at DESC);

CREATE TABLE public.approval_steps (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  approval_request_id text NOT NULL,
  approval_rule_id text,
  step_order smallint NOT NULL CHECK (step_order > 0),
  required_roles text[] NOT NULL CHECK (cardinality(required_roles) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, approval_request_id, step_order),
  FOREIGN KEY (company_id, approval_request_id)
    REFERENCES public.approval_requests(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, approval_rule_id)
    REFERENCES public.approval_rules(company_id, id) ON DELETE SET NULL (approval_rule_id)
);

CREATE INDEX approval_steps_current_idx
  ON public.approval_steps(company_id, approval_request_id, step_order);

-- Decisions are append-only evidence. A unique step reference makes a decision
-- idempotent under concurrent approver clicks without overwriting history.
CREATE TABLE public.approval_decisions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  approval_request_id text NOT NULL,
  approval_step_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, approval_step_id),
  FOREIGN KEY (company_id, approval_request_id)
    REFERENCES public.approval_requests(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, approval_step_id)
    REFERENCES public.approval_steps(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX approval_decisions_request_idx
  ON public.approval_decisions(company_id, approval_request_id, decided_at);

CREATE TABLE public.notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval_step_id text,
  kind text NOT NULL CHECK (kind IN ('approval_requested', 'approval_resolved', 'system')),
  title text NOT NULL CHECK (length(title) > 0),
  body text NOT NULL DEFAULT '',
  doc_type text,
  doc_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, approval_step_id)
    REFERENCES public.approval_steps(company_id, id) ON DELETE SET NULL (approval_step_id),
  CHECK ((doc_type IS NULL) = (doc_id IS NULL))
);

CREATE UNIQUE INDEX notifications_recipient_step_idx
  ON public.notifications(recipient_user_id, approval_step_id)
  WHERE approval_step_id IS NOT NULL;
CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications(company_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_approval_request_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
    OR NEW.doc_id IS DISTINCT FROM OLD.doc_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
    RAISE EXCEPTION 'approval request identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_approval_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER approval_requests_identity_guard
BEFORE UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_approval_request_identity();

CREATE TRIGGER approval_steps_append_only
BEFORE UPDATE OR DELETE ON public.approval_steps
FOR EACH ROW EXECUTE FUNCTION public.prevent_approval_history_mutation();

CREATE TRIGGER approval_decisions_append_only
BEFORE UPDATE OR DELETE ON public.approval_decisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_approval_history_mutation();

CREATE OR REPLACE FUNCTION public.assert_approval_rule_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_role_array(NEW.approver_roles);

  -- M6's generic approved/rejected transitions are deliberately restricted to
  -- approver/admin roles. Keeping rules compatible avoids a route that can be
  -- entered but never resolved through the trusted transition RPC.
  IF NOT NEW.approver_roles && ARRAY['approver', 'admin']::text[] THEN
    RAISE EXCEPTION 'approval rules must include approver or admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER approval_rules_role_guard
BEFORE INSERT OR UPDATE OF approver_roles ON public.approval_rules
FOR EACH ROW EXECUTE FUNCTION public.assert_approval_rule_roles();

-- Locks the whitelisted M6 document row. Call this within a write RPC when a
-- client-supplied version must still be current at the point of mutation.
CREATE OR REPLACE FUNCTION public.assert_document_row_version(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_row_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  EXECUTE format(
    'SELECT company_id, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_row_version
  USING p_doc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  IF v_row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'stale document version: expected %, current %',
      p_expected_row_version, v_row_version
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_step_notifications(
  p_approval_request_id text,
  p_step_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.approval_requests
  WHERE id = p_approval_request_id
  FOR KEY SHARE;

  SELECT * INTO v_step
  FROM public.approval_steps
  WHERE id = p_step_id
    AND company_id = v_request.company_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval step not found';
  END IF;

  INSERT INTO public.notifications (
    company_id, recipient_user_id, approval_step_id, kind, title, body, doc_type, doc_id
  )
  SELECT
    v_request.company_id,
    cm.user_id,
    v_step.id,
    'approval_requested',
    'Approval required',
    'A ' || v_request.doc_type || ' document is awaiting your decision.',
    v_request.doc_type,
    v_request.doc_id
  FROM public.company_members AS cm
  WHERE cm.company_id = v_request.company_id
    AND cm.active
    AND cm.roles && v_step.required_roles
  ON CONFLICT (recipient_user_id, approval_step_id) WHERE approval_step_id IS NOT NULL
  DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_doc_type text,
  p_doc_id text,
  p_active_role text DEFAULT NULL,
  p_expected_row_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table text;
  v_company_id text;
  v_state text;
  v_amount numeric(18,3);
  v_request_id text;
  v_first_step_id text;
  v_step_count integer;
  v_target jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Approval is only defined for monetary documents that use M6's generic
  -- draft -> pending -> confirmed lifecycle. In particular, RFQs and
  -- operational documents must use their own domain workflows.
  IF p_doc_type <> ALL (
    ARRAY[
      'po',
      'vendor_bill',
      'vendor_payment',
      'debit_note',
      'quote',
      'so',
      'customer_invoice',
      'customer_receipt',
      'credit_note'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'approval workflow is not supported for document type: %', p_doc_type;
  END IF;

  v_table := public.document_table_name(p_doc_type);

  IF p_expected_row_version IS NOT NULL THEN
    PERFORM public.assert_document_row_version(
      p_doc_type, p_doc_id, p_expected_row_version
    );
  END IF;

  EXECUTE format(
    'SELECT company_id, state, '
    || 'coalesce((to_jsonb(d) ->> ''total'')::numeric, '
    || '(to_jsonb(d) ->> ''amount'')::numeric, 0) '
    || 'FROM public.%I AS d '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_state, v_amount
  USING p_doc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  IF v_state <> 'draft' THEN
    RAISE EXCEPTION 'only draft documents can enter approval';
  END IF;

  -- transition_document provides the authoritative draft -> pending check and
  -- audit event after the monetary document type has been explicitly allowed.
  PERFORM public.transition_document(p_doc_type, p_doc_id, 'submit', p_active_role);

  INSERT INTO public.approval_requests (
    company_id, doc_type, doc_id, amount, requested_by
  )
  VALUES (v_company_id, p_doc_type, p_doc_id, v_amount, auth.uid())
  RETURNING id INTO v_request_id;

  INSERT INTO public.approval_steps (
    company_id, approval_request_id, approval_rule_id, step_order, required_roles
  )
  SELECT
    v_company_id,
    v_request_id,
    ar.id,
    row_number() OVER (ORDER BY ar.sequence, ar.min_amount, ar.id)::smallint,
    ar.approver_roles
  FROM public.approval_rules AS ar
  WHERE ar.company_id = v_company_id
    AND ar.doc_type = p_doc_type
    AND ar.active
    AND v_amount >= ar.min_amount
    AND (ar.max_amount IS NULL OR v_amount <= ar.max_amount)
  ORDER BY ar.sequence, ar.min_amount, ar.id;

  GET DIAGNOSTICS v_step_count = ROW_COUNT;

  IF v_step_count = 0 THEN
    -- Preserve M6's transition authorization and audit event even when no
    -- approval rule matches. This deliberately fails for non-approvers.
    v_target := public.transition_document(
      p_doc_type,
      p_doc_id,
      'approve',
      p_active_role,
      'No active approval rule matched'
    );

    UPDATE public.approval_requests
    SET status = 'auto_confirmed',
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_reason = 'No active approval rule matched'
    WHERE id = v_request_id;

    RETURN jsonb_build_object(
      'id', v_request_id,
      'status', 'auto_confirmed',
      'docState', v_target ->> 'state'
    );
  END IF;

  SELECT s.id INTO v_first_step_id
  FROM public.approval_steps AS s
  WHERE s.company_id = v_company_id
    AND s.approval_request_id = v_request_id
  ORDER BY s.step_order
  LIMIT 1;

  PERFORM public.create_step_notifications(v_request_id, v_first_step_id);

  RETURN jsonb_build_object(
    'id', v_request_id, 'status', 'pending', 'docState', 'pending',
    'stepCount', v_step_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_approval_request(
  p_approval_request_id text,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_active_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_steps%ROWTYPE;
  v_next_step_id text;
  v_target jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;

  SELECT * INTO v_request
  FROM public.approval_requests
  WHERE id = p_approval_request_id
    AND (company_id = public.my_company_id() OR public.is_platform_admin())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approval request is already resolved';
  END IF;

  SELECT s.* INTO v_step
  FROM public.approval_steps AS s
  WHERE s.company_id = v_request.company_id
    AND s.approval_request_id = v_request.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.approval_decisions AS d
      WHERE d.company_id = s.company_id
        AND d.approval_step_id = s.id
    )
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval request has no open step';
  END IF;
  IF NOT public.has_company_role(VARIADIC v_step.required_roles) THEN
    RAISE EXCEPTION 'current company role cannot decide this approval step';
  END IF;

  INSERT INTO public.approval_decisions (
    company_id, approval_request_id, approval_step_id, decision, decided_by, reason
  )
  VALUES (
    v_request.company_id, v_request.id, v_step.id, p_decision, auth.uid(), p_reason
  );

  IF p_decision = 'rejected' THEN
    UPDATE public.approval_requests
    SET status = 'rejected',
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_reason = p_reason
    WHERE id = v_request.id;

    v_target := public.transition_document(
      v_request.doc_type, v_request.doc_id, 'reject', p_active_role, p_reason
    );
    RETURN jsonb_build_object(
      'id', v_request.id, 'status', 'rejected', 'document', v_target
    );
  END IF;

  SELECT s.id INTO v_next_step_id
  FROM public.approval_steps AS s
  WHERE s.company_id = v_request.company_id
    AND s.approval_request_id = v_request.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.approval_decisions AS d
      WHERE d.company_id = s.company_id
        AND d.approval_step_id = s.id
    )
  ORDER BY s.step_order
  LIMIT 1;

  IF v_next_step_id IS NOT NULL THEN
    PERFORM public.create_step_notifications(v_request.id, v_next_step_id);
    RETURN jsonb_build_object(
      'id', v_request.id, 'status', 'pending', 'nextStepId', v_next_step_id
    );
  END IF;

  UPDATE public.approval_requests
  SET status = 'approved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_reason = p_reason
  WHERE id = v_request.id;

  v_target := public.transition_document(
    v_request.doc_type, v_request.doc_id, 'approve', p_active_role, p_reason
  );
  RETURN jsonb_build_object(
    'id', v_request.id, 'status', 'approved', 'document', v_target
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification public.notifications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_notification
  FROM public.notifications
  WHERE id = p_notification_id
    AND recipient_user_id = auth.uid()
    AND (company_id = public.my_company_id() OR public.is_platform_admin())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification not found';
  END IF;

  UPDATE public.notifications
  SET read_at = coalesce(read_at, now())
  WHERE id = v_notification.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_vendor_invoice_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_id text;
BEGIN
  -- Serialize the friendly preflight check per vendor/invoice. The M3 unique
  -- constraint remains the final concurrency-safe backstop if another writer
  -- bypasses this trigger path.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.company_id || ':' || NEW.supplier_id || ':' || lower(trim(NEW.invoice_number)),
      0
    )
  );

  IF TG_OP = 'UPDATE' THEN
    v_old_id := OLD.id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_bills AS vb
    WHERE vb.company_id = NEW.company_id
      AND vb.supplier_id = NEW.supplier_id
      AND vb.invoice_number = NEW.invoice_number
      AND vb.id <> coalesce(v_old_id, '')
  ) THEN
    RAISE EXCEPTION 'duplicate vendor invoice number % for this supplier',
      NEW.invoice_number
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_bills_duplicate_invoice_guard
BEFORE INSERT OR UPDATE OF supplier_id, invoice_number ON public.vendor_bills
FOR EACH ROW EXECUTE FUNCTION public.assert_vendor_invoice_unique();

CREATE OR REPLACE FUNCTION public.guard_customer_invoice_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
BEGIN
  IF NEW.state = 'confirmed' AND OLD.state IS DISTINCT FROM 'confirmed' THEN
    SELECT * INTO v_customer
    FROM public.customers
    WHERE company_id = NEW.company_id
      AND id = NEW.customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer not found';
    END IF;
    IF NOT v_customer.active OR v_customer.payment_status = 'on_hold' THEN
      RAISE EXCEPTION 'customer is on credit hold';
    END IF;
    IF v_customer.exposure + NEW.total > v_customer.credit_limit THEN
      RAISE EXCEPTION 'customer credit limit exceeded: exposure % + invoice % > limit %',
        v_customer.exposure, NEW.total, v_customer.credit_limit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_invoices_credit_guard
BEFORE UPDATE OF state ON public.customer_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_invoice_credit();

CREATE OR REPLACE FUNCTION public.resolve_price_list_item(
  p_price_list_id text,
  p_product_id text,
  p_qty numeric,
  p_on_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_currency text;
  v_item public.price_list_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  SELECT pl.company_id, pl.currency INTO v_company_id, v_currency
  FROM public.price_lists AS pl
  WHERE pl.id = p_price_list_id
    AND pl.active
    AND (pl.starts_on IS NULL OR pl.starts_on <= p_on_date)
    AND (pl.ends_on IS NULL OR pl.ends_on >= p_on_date)
    AND (pl.company_id = public.my_company_id() OR public.is_platform_admin())
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active price list not found';
  END IF;

  SELECT * INTO v_item
  FROM public.price_list_items AS pli
  WHERE pli.company_id = v_company_id
    AND pli.price_list_id = p_price_list_id
    AND pli.product_id = p_product_id
    AND pli.min_qty <= p_qty
  ORDER BY pli.min_qty DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no price-list item matches product and quantity';
  END IF;

  RETURN jsonb_build_object(
    'priceListId', p_price_list_id,
    'priceListItemId', v_item.id,
    'productId', p_product_id,
    'quantity', p_qty,
    'minQty', v_item.min_qty,
    'unitPrice', v_item.unit_price,
    'currency', v_currency
  );
END;
$$;

-- All tables retain the standard company boundary first; notifications then add
-- recipient-only visibility. Runtime clients cannot manufacture or mutate
-- workflow/audit rows, and use the narrowly scoped RPCs above instead.
SELECT public.apply_company_access('approval_requests');
SELECT public.apply_company_access('approval_steps');
SELECT public.apply_company_access('approval_decisions');
SELECT public.apply_company_access('notifications');

DROP POLICY company_isolation ON public.notifications;
CREATE POLICY notification_recipient_read ON public.notifications
FOR SELECT TO authenticated
USING (
  (
    company_id = (SELECT public.my_company_id())
    AND recipient_user_id = (SELECT auth.uid())
  )
  OR (SELECT public.is_platform_admin())
);

REVOKE INSERT, UPDATE, DELETE ON public.approval_requests, public.approval_steps,
  public.approval_decisions, public.notifications FROM authenticated;
GRANT SELECT ON public.approval_requests, public.approval_steps,
  public.approval_decisions, public.notifications TO authenticated;

REVOKE ALL ON FUNCTION public.guard_approval_request_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_approval_history_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_approval_rule_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_document_row_version(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_step_notifications(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_approval_request(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_approval_request(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_vendor_invoice_unique() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_customer_invoice_credit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_price_list_item(text, text, numeric, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_document_row_version(text, text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_approval_request(text, text, text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_approval_request(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_price_list_item(text, text, numeric, date)
  TO authenticated;
