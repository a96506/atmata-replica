-- Phase 2 functions support: durable email delivery and reviewed AI proposals.
--
-- The reviewed company-table baseline is 77. This migration adds exactly four
-- company-owned tables, so future schema allowlists/manifests must expect 81:
-- email_log, ai_suggestions, ai_queued_actions, and ai_thresholds.
-- No allowlist/manifest object exists in the current schema; do not introduce a
-- second tenant abstraction here. All four tables use the canonical
-- public.apply_company_access() / public.my_company_id() company boundary.

CREATE TABLE public.email_log (
  id text PRIMARY KEY DEFAULT public.gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN (
      'quote_sent',
      'rfq_invitation',
      'approval_requested',
      'approval_rejected',
      'user_invitation'
    )),
  recipient text NOT NULL CHECK (char_length(trim(recipient)) > 0),
  subject text NOT NULL CHECK (char_length(trim(subject)) > 0),
  locale text NOT NULL CHECK (locale IN ('en', 'ar')),
  doc_type text,
  doc_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  provider_reference text,
  idempotency_key text NOT NULL
    CHECK (char_length(trim(idempotency_key)) > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lease_token_hash text,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, idempotency_key),
  CHECK ((doc_type IS NULL) = (doc_id IS NULL)),
  CHECK (doc_type IS NULL OR char_length(trim(doc_type)) > 0),
  CHECK (doc_id IS NULL OR char_length(trim(doc_id)) > 0),
  CHECK (
    (status = 'sending'
      AND lease_token_hash IS NOT NULL
      AND lease_token_hash ~ '^[0-9a-f]{64}$'
      AND lease_expires_at IS NOT NULL)
    OR (status <> 'sending'
      AND lease_token_hash IS NULL
      AND lease_expires_at IS NULL)
  ),
  CHECK ((status = 'sent' AND sent_at IS NOT NULL) OR status <> 'sent'),
  CHECK (
    (status = 'failed' AND last_error_code IS NOT NULL
      AND char_length(trim(last_error_code)) > 0)
    OR (status <> 'failed' AND last_error_code IS NULL)
  ),
  CHECK (provider_reference IS NULL OR char_length(trim(provider_reference)) > 0)
);

CREATE INDEX email_log_delivery_idx
  ON public.email_log(company_id, status, lease_expires_at, created_at);
CREATE INDEX email_log_document_idx
  ON public.email_log(company_id, doc_type, doc_id)
  WHERE doc_type IS NOT NULL;
CREATE INDEX email_log_requested_by_idx
  ON public.email_log(company_id, requested_by, created_at DESC);

CREATE TABLE public.ai_suggestions (
  id text PRIMARY KEY DEFAULT public.gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope_kind text NOT NULL
    CHECK (scope_kind IN (
      'company',
      'procurement',
      'sales',
      'inventory',
      'accounting',
      'reconciliation',
      'document'
    )),
  scope_type text,
  scope_id text,
  category text NOT NULL
    CHECK (category IN (
      'anomaly',
      'reconciliation',
      'cash_flow',
      'inventory',
      'compliance',
      'efficiency',
      'risk'
    )),
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title_en text NOT NULL CHECK (char_length(trim(title_en)) > 0),
  title_ar text NOT NULL CHECK (char_length(trim(title_ar)) > 0),
  rationale_en text NOT NULL CHECK (char_length(trim(rationale_en)) > 0),
  rationale_ar text NOT NULL CHECK (char_length(trim(rationale_ar)) > 0),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  proposed_action jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposed_action) = 'object'),
  model text NOT NULL CHECK (char_length(trim(model)) > 0),
  prompt_version text NOT NULL CHECK (char_length(trim(prompt_version)) > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dismissed', 'queued', 'expired')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK ((scope_type IS NULL) = (scope_id IS NULL)),
  CHECK (scope_type IS NULL OR char_length(trim(scope_type)) > 0),
  CHECK (scope_id IS NULL OR char_length(trim(scope_id)) > 0),
  CHECK (scope_kind <> 'company' OR (scope_type IS NULL AND scope_id IS NULL)),
  CHECK (scope_kind = 'company' OR (scope_type IS NOT NULL AND scope_id IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX ai_suggestions_list_idx
  ON public.ai_suggestions(company_id, status, severity, created_at DESC);
CREATE INDEX ai_suggestions_scope_idx
  ON public.ai_suggestions(company_id, scope_kind, scope_type, scope_id);
CREATE INDEX ai_suggestions_expiry_idx
  ON public.ai_suggestions(company_id, expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;
CREATE INDEX ai_suggestions_creator_idx
  ON public.ai_suggestions(company_id, created_by, created_at DESC);

CREATE TABLE public.ai_queued_actions (
  id text PRIMARY KEY DEFAULT public.gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  suggestion_id text NOT NULL,
  action_name text NOT NULL
    CHECK (action_name IN (
      'create_draft_vendor_bill',
      'accept_reconciliation_match',
      'create_purchase_requisition',
      'create_draft_journal_entry'
    )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  review_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at timestamptz,
  failure_code text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, suggestion_id),
  FOREIGN KEY (company_id, suggestion_id)
    REFERENCES public.ai_suggestions(company_id, id) ON DELETE CASCADE,
  CHECK (review_reason IS NULL OR char_length(trim(review_reason)) > 0),
  CHECK (failure_code IS NULL OR char_length(trim(failure_code)) > 0),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'pending' AND reviewed_at IS NOT NULL)
  ),
  CHECK (
    (status = 'executed' AND executed_at IS NOT NULL)
    OR (status <> 'executed' AND executed_by IS NULL AND executed_at IS NULL)
  ),
  CHECK ((status = 'failed' AND failure_code IS NOT NULL) OR status <> 'failed')
);

CREATE INDEX ai_queued_actions_review_idx
  ON public.ai_queued_actions(company_id, status, created_at);
CREATE INDEX ai_queued_actions_reviewer_idx
  ON public.ai_queued_actions(company_id, reviewed_by, reviewed_at DESC);

CREATE TABLE public.ai_thresholds (
  id text PRIMARY KEY DEFAULT public.gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_type text NOT NULL
    CHECK (automation_type IN (
      'create_draft_vendor_bill',
      'accept_reconciliation_match',
      'create_purchase_requisition',
      'create_draft_journal_entry'
    )),
  default_threshold numeric(5,4) NOT NULL DEFAULT 0.7000
    CHECK (default_threshold BETWEEN 0 AND 1),
  auto_approve_threshold numeric(5,4) NOT NULL DEFAULT 0.9500
    CHECK (auto_approve_threshold BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, automation_type),
  CHECK (auto_approve_threshold >= default_threshold)
);

-- apply_company_access installs RLS, a company WITH CHECK policy, the immutable
-- company guard, and the canonical company_id index. Runtime DML is narrowed
-- below because all writes must pass through trusted RPC/function paths.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'email_log',
    'ai_suggestions',
    'ai_queued_actions',
    'ai_thresholds'
  ]
  LOOP
    PERFORM public.apply_company_access(v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_functions_support_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable';
  END IF;

  IF TG_TABLE_NAME = 'email_log'
    AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'email_log.idempotency_key is immutable';
  END IF;

  IF TG_TABLE_NAME = 'ai_queued_actions'
    AND (
      NEW.suggestion_id IS DISTINCT FROM OLD.suggestion_id
      OR NEW.action_name IS DISTINCT FROM OLD.action_name
      OR NEW.payload IS DISTINCT FROM OLD.payload
    ) THEN
    RAISE EXCEPTION 'ai_queued_actions source identity is immutable';
  END IF;

  IF TG_TABLE_NAME = 'ai_thresholds'
    AND NEW.automation_type IS DISTINCT FROM OLD.automation_type THEN
    RAISE EXCEPTION 'ai_thresholds.automation_type is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER email_log_lock_identity
BEFORE UPDATE ON public.email_log
FOR EACH ROW EXECUTE FUNCTION public.guard_functions_support_identity();

CREATE TRIGGER ai_suggestions_lock_identity
BEFORE UPDATE ON public.ai_suggestions
FOR EACH ROW EXECUTE FUNCTION public.guard_functions_support_identity();

CREATE TRIGGER ai_queued_actions_lock_identity
BEFORE UPDATE ON public.ai_queued_actions
FOR EACH ROW EXECUTE FUNCTION public.guard_functions_support_identity();

CREATE TRIGGER ai_thresholds_lock_identity
BEFORE UPDATE ON public.ai_thresholds
FOR EACH ROW EXECUTE FUNCTION public.guard_functions_support_identity();

CREATE OR REPLACE FUNCTION public.queue_ai_action(
  p_suggestion_id text,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.ai_queued_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_suggestion public.ai_suggestions%ROWTYPE;
  v_action public.ai_queued_actions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_action IS NULL OR p_action NOT IN (
    'create_draft_vendor_bill',
    'accept_reconciliation_match',
    'create_purchase_requisition',
    'create_draft_journal_entry'
  ) THEN
    RAISE EXCEPTION 'unsupported AI action';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'AI action payload must be an object';
  END IF;

  SELECT s.*
  INTO v_suggestion
  FROM public.ai_suggestions AS s
  WHERE s.company_id = v_company_id
    AND s.id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI suggestion not found';
  END IF;

  SELECT a.*
  INTO v_action
  FROM public.ai_queued_actions AS a
  WHERE a.company_id = v_company_id
    AND a.suggestion_id = p_suggestion_id;

  IF FOUND THEN
    IF v_action.action_name IS DISTINCT FROM p_action
      OR v_action.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'AI suggestion already queued with different action';
    END IF;
    RETURN v_action;
  END IF;

  IF v_suggestion.status <> 'active'
    OR (v_suggestion.expires_at IS NOT NULL AND v_suggestion.expires_at <= now()) THEN
    RAISE EXCEPTION 'AI suggestion is not queueable';
  END IF;

  INSERT INTO public.ai_queued_actions (
    company_id,
    suggestion_id,
    action_name,
    payload,
    created_by
  )
  VALUES (
    v_company_id,
    p_suggestion_id,
    p_action,
    p_payload,
    v_user_id
  )
  RETURNING * INTO v_action;

  UPDATE public.ai_suggestions
  SET status = 'queued'
  WHERE company_id = v_company_id
    AND id = p_suggestion_id;

  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_ai_action(
  p_action_id text,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS public.ai_queued_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_action public.ai_queued_actions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT public.has_company_role('approver', 'admin') THEN
    RAISE EXCEPTION 'approver or admin role required';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;
  IF p_reason IS NOT NULL AND char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'review reason cannot be empty';
  END IF;

  SELECT a.*
  INTO v_action
  FROM public.ai_queued_actions AS a
  WHERE a.company_id = v_company_id
    AND a.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI queued action not found';
  END IF;
  IF v_action.status <> 'pending' THEN
    RAISE EXCEPTION 'AI queued action is not pending';
  END IF;

  UPDATE public.ai_queued_actions
  SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      review_reason = p_reason,
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE company_id = v_company_id
    AND id = p_action_id
  RETURNING * INTO v_action;

  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_delivery(
  p_idempotency_key text,
  p_kind text,
  p_recipient text,
  p_subject text,
  p_locale text,
  p_doc_type text DEFAULT NULL,
  p_doc_id text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_log public.email_log%ROWTYPE;
  v_claimed boolean := false;
  v_lease_token text;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'quote_sent',
    'rfq_invitation',
    'approval_requested',
    'approval_rejected',
    'user_invitation'
  ) THEN
    RAISE EXCEPTION 'unsupported email kind';
  END IF;
  IF p_recipient IS NULL OR char_length(trim(p_recipient)) = 0
    OR p_subject IS NULL OR char_length(trim(p_subject)) = 0 THEN
    RAISE EXCEPTION 'recipient and subject required';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en', 'ar') THEN
    RAISE EXCEPTION 'unsupported locale';
  END IF;
  IF (p_doc_type IS NULL) <> (p_doc_id IS NULL) THEN
    RAISE EXCEPTION 'doc_type and doc_id must be supplied together';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 30 and 900';
  END IF;

  INSERT INTO public.email_log (
    company_id,
    kind,
    recipient,
    subject,
    locale,
    doc_type,
    doc_id,
    idempotency_key,
    requested_by
  )
  VALUES (
    v_company_id,
    p_kind,
    trim(p_recipient),
    trim(p_subject),
    p_locale,
    p_doc_type,
    p_doc_id,
    trim(p_idempotency_key),
    v_user_id
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING;

  SELECT e.*
  INTO v_log
  FROM public.email_log AS e
  WHERE e.company_id = v_company_id
    AND e.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;

  IF v_log.kind IS DISTINCT FROM p_kind
    OR v_log.recipient IS DISTINCT FROM trim(p_recipient)
    OR v_log.subject IS DISTINCT FROM trim(p_subject)
    OR v_log.locale IS DISTINCT FROM p_locale
    OR v_log.doc_type IS DISTINCT FROM p_doc_type
    OR v_log.doc_id IS DISTINCT FROM p_doc_id THEN
    RAISE EXCEPTION 'idempotency key already used with different email content';
  END IF;

  IF v_log.status IN ('queued', 'failed')
    OR (v_log.status = 'sending' AND v_log.lease_expires_at <= now()) THEN
    v_lease_token := public.gen_random_uuid()::text;

    UPDATE public.email_log
    SET status = 'sending',
        attempt_count = attempt_count + 1,
        last_error_code = NULL,
        lease_token_hash = encode(public.digest(v_lease_token, 'sha256'), 'hex'),
        lease_expires_at = now() + (p_lease_seconds * interval '1 second')
    WHERE company_id = v_company_id
      AND id = v_log.id
    RETURNING * INTO v_log;

    v_claimed := true;
  END IF;

  RETURN jsonb_build_object(
    'claimed', v_claimed,
    'leaseToken', CASE WHEN v_claimed THEN v_lease_token ELSE NULL END,
    'delivery', to_jsonb(v_log) - 'lease_token_hash'
  );
END;
$$;

-- Phase 3 email-send uses this controlled completion path after a successful
-- claim. The lease token prevents a stale or competing worker from finalizing.
CREATE OR REPLACE FUNCTION public.complete_email_delivery(
  p_delivery_id text,
  p_lease_token text,
  p_status text,
  p_provider_reference text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS public.email_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_log public.email_log%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'completion status must be sent, failed, or skipped';
  END IF;
  IF p_lease_token IS NULL OR char_length(trim(p_lease_token)) = 0 THEN
    RAISE EXCEPTION 'lease token required';
  END IF;
  IF p_status = 'failed'
    AND (p_error_code IS NULL OR char_length(trim(p_error_code)) = 0) THEN
    RAISE EXCEPTION 'failed delivery requires an error code';
  END IF;

  SELECT e.*
  INTO v_log
  FROM public.email_log AS e
  WHERE e.company_id = v_company_id
    AND e.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'email delivery not found';
  END IF;
  IF v_log.status <> 'sending'
    OR v_log.lease_token_hash IS DISTINCT FROM
      encode(public.digest(trim(p_lease_token), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'email delivery lease is not active';
  END IF;

  UPDATE public.email_log
  SET status = p_status,
      provider_reference = CASE
        WHEN p_status = 'sent' THEN nullif(trim(p_provider_reference), '')
        ELSE provider_reference
      END,
      last_error_code = CASE
        WHEN p_status = 'failed' THEN trim(p_error_code)
        ELSE NULL
      END,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE NULL END,
      lease_token_hash = NULL,
      lease_expires_at = NULL
  WHERE company_id = v_company_id
    AND id = p_delivery_id
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

-- apply_company_access grants broad DML by default. Keep tenant-readable rows,
-- but remove all direct runtime writes; the SECURITY DEFINER RPCs are the only
-- authenticated mutation surface created by this migration.
REVOKE ALL PRIVILEGES ON
  public.email_log,
  public.ai_suggestions,
  public.ai_queued_actions,
  public.ai_thresholds
FROM anon, authenticated;

GRANT SELECT ON
  public.email_log,
  public.ai_suggestions,
  public.ai_queued_actions,
  public.ai_thresholds
TO authenticated;

REVOKE ALL ON FUNCTION public.guard_functions_support_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_ai_action(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_ai_action(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_delivery(
  text, text, text, text, text, text, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_email_delivery(
  text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.queue_ai_action(text, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_ai_action(text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_delivery(
  text, text, text, text, text, text, text, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_delivery(
  text, text, text, text, text
) TO authenticated;
