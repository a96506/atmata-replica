-- M17 — operational write RPCs (bank recon, period close, fiscal, inbox).
-- Depends on M13 write-command foundation + M14 JSON helpers + M3 AI
-- ensure_reconciliation_session. Do NOT redefine ensure_period_close_* or
-- json_text / json_date / json_numeric.
-- Authenticated DML on operational tables is revoked; mutations go through
-- these SECURITY DEFINER RPCs only. M17 exclusively owns
-- accept_reconciliation_match (functions only suggest).

-- ---------------------------------------------------------------------------
-- Revoke direct DML (SELECT remains via RLS)
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.bank_statements
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bank_statement_lines
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reconciliation_sessions
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reconciliation_rules
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reconciliation_matches
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.period_close_runs
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.period_close_tasks
  FROM anon, authenticated;
REVOKE UPDATE ON public.fiscal_periods FROM anon, authenticated;

GRANT SELECT ON public.bank_statements TO authenticated;
GRANT SELECT ON public.bank_statement_lines TO authenticated;
GRANT SELECT ON public.reconciliation_sessions TO authenticated;
GRANT SELECT ON public.reconciliation_rules TO authenticated;
GRANT SELECT ON public.reconciliation_matches TO authenticated;
GRANT SELECT ON public.period_close_runs TO authenticated;
GRANT SELECT ON public.period_close_tasks TO authenticated;
GRANT SELECT ON public.fiscal_periods TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal: mark statement reconciling when a session is active
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mark_statement_reconciling(
  p_company_id text,
  p_statement_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.bank_statements
  SET status = 'reconciling'
  WHERE company_id = p_company_id
    AND id = p_statement_id
    AND status = 'imported';
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. import_bank_statement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_bank_statement(
  p_idempotency_key text,
  p_header jsonb,
  p_lines jsonb,
  p_attachment jsonb DEFAULT NULL
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
  v_bank_account_id text;
  v_number text;
  v_period_start date;
  v_period_end date;
  v_opening numeric(18, 3);
  v_closing numeric(18, 3);
  v_line jsonb;
  v_line_count integer := 0;
  v_line_number integer;
  v_amount numeric(18, 3);
  v_att_key text;
  v_att_url text;
  v_att_id text;
  v_bucket text := 'imports';
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'header required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
    OR jsonb_array_length(p_lines) < 1 THEN
    PERFORM public.raise_write_error('VALIDATION', 'at least one statement line required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'header', p_header,
      'lines', p_lines,
      'attachment', p_attachment
    )
  );

  v_claim := public.claim_write_command(
    p_idempotency_key, 'import_bank_statement', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_bank_account_id := public.json_text(p_header, 'bankAccountId', true);
  v_number := public.json_text(p_header, 'number', true);
  v_period_start := public.json_date(p_header, 'periodStart', false);
  v_period_end := public.json_date(p_header, 'periodEnd', false);
  v_opening := public.json_numeric(p_header, 'openingBalance', false);
  v_closing := public.json_numeric(p_header, 'closingBalance', false);

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_accounts AS ba
    WHERE ba.company_id = v_ctx.company_id
      AND ba.id = v_bank_account_id
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank account not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_statements AS bs
    WHERE bs.company_id = v_ctx.company_id
      AND bs.number = v_number
  ) THEN
    PERFORM public.raise_write_error('CONFLICT', 'statement number already exists');
  END IF;

  IF p_attachment IS NOT NULL AND jsonb_typeof(p_attachment) = 'object' THEN
    v_att_key := public.json_text(p_attachment, 'key', true);
    v_att_url := public.json_text(p_attachment, 'url', true);
    IF left(v_att_key, char_length(v_ctx.company_id) + 1)
      <> v_ctx.company_id || '/' THEN
      PERFORM public.raise_write_error(
        'VALIDATION',
        'attachment key must be scoped to company'
      );
    END IF;
  END IF;

  INSERT INTO public.bank_statements (
    company_id,
    bank_account_id,
    number,
    period_start,
    period_end,
    opening_balance,
    closing_balance,
    source_url,
    source_key,
    status,
    imported_by
  )
  VALUES (
    v_ctx.company_id,
    v_bank_account_id,
    v_number,
    v_period_start,
    v_period_end,
    v_opening,
    v_closing,
    v_att_url,
    v_att_key,
    'imported',
    v_ctx.user_id
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      PERFORM public.raise_write_error('VALIDATION', 'each line must be an object');
    END IF;

    v_line_number := coalesce(
      public.json_numeric(v_line, 'lineNumber', true)::integer,
      0
    );
    IF v_line_number <= 0 THEN
      PERFORM public.raise_write_error('VALIDATION', 'lineNumber must be positive');
    END IF;

    v_amount := public.json_numeric(v_line, 'amount', true);
    IF v_amount IS NULL OR v_amount = 0 THEN
      PERFORM public.raise_write_error('VALIDATION', 'amount must be non-zero');
    END IF;

    INSERT INTO public.bank_statement_lines (
      company_id,
      bank_statement_id,
      line_number,
      date,
      description,
      reference,
      amount,
      running_balance,
      status
    )
    VALUES (
      v_ctx.company_id,
      v_id,
      v_line_number,
      public.json_date(v_line, 'date', true),
      coalesce(public.json_text(v_line, 'description', false), ''),
      public.json_text(v_line, 'reference', false),
      v_amount,
      public.json_numeric(v_line, 'runningBalance', false),
      'unmatched'
    );

    v_line_count := v_line_count + 1;
  END LOOP;

  IF v_att_key IS NOT NULL THEN
    INSERT INTO public.attachments (
      company_id,
      doc_type,
      doc_id,
      bucket,
      key,
      url,
      mime,
      size,
      filename,
      uploaded_by
    )
    VALUES (
      v_ctx.company_id,
      'bank_statement',
      v_id,
      v_bucket,
      v_att_key,
      v_att_url,
      public.json_text(p_attachment, 'mime', false),
      public.json_numeric(p_attachment, 'size', false)::bigint,
      public.json_text(p_attachment, 'filename', false),
      v_ctx.user_id
    )
    RETURNING id INTO v_att_id;
  END IF;

  v_result := jsonb_build_object(
    'statementId', v_id,
    'number', v_number,
    'lineCount', v_line_count,
    'status', 'imported',
    'attachmentId', v_att_id
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. upsert_reconciliation_rule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_reconciliation_rule(
  p_idempotency_key text,
  p_rule jsonb
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
  v_name text;
  v_priority integer;
  v_match_type text;
  v_conditions jsonb;
  v_action jsonb;
  v_active boolean;
  v_existing public.reconciliation_rules%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_rule IS NULL OR jsonb_typeof(p_rule) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'rule required');
  END IF;

  v_hash := public.request_hash_from_json(jsonb_build_object('rule', p_rule));
  v_claim := public.claim_write_command(
    p_idempotency_key, 'upsert_reconciliation_rule', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_id := public.json_text(p_rule, 'id', false);
  v_name := public.json_text(p_rule, 'name', true);
  v_priority := coalesce(
    public.json_numeric(p_rule, 'priority', false)::integer,
    100
  );
  IF v_priority < 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'priority must be >= 0');
  END IF;

  v_match_type := public.json_text(p_rule, 'matchType', true);
  IF v_match_type NOT IN ('reference', 'amount', 'description', 'compound') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'matchType must be reference, amount, description, or compound'
    );
  END IF;

  v_conditions := coalesce(p_rule -> 'conditions', '{}'::jsonb);
  IF jsonb_typeof(v_conditions) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'conditions must be an object');
  END IF;

  v_action := coalesce(p_rule -> 'action', '{}'::jsonb);
  IF jsonb_typeof(v_action) <> 'object' THEN
    PERFORM public.raise_write_error('VALIDATION', 'action must be an object');
  END IF;

  IF p_rule ? 'active' AND jsonb_typeof(p_rule -> 'active') = 'boolean' THEN
    v_active := (p_rule ->> 'active')::boolean;
  ELSE
    v_active := true;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT r.*
    INTO v_existing
    FROM public.reconciliation_rules AS r
    WHERE r.company_id = v_ctx.company_id
      AND r.id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.raise_write_error('NOT_FOUND', 'reconciliation rule not found');
    END IF;

    UPDATE public.reconciliation_rules
    SET name = v_name,
        priority = v_priority,
        match_type = v_match_type,
        conditions = v_conditions,
        action = v_action,
        active = v_active
    WHERE company_id = v_ctx.company_id
      AND id = v_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.reconciliation_rules (
      company_id, name, priority, match_type, conditions, action, active
    )
    VALUES (
      v_ctx.company_id,
      v_name,
      v_priority,
      v_match_type,
      v_conditions,
      v_action,
      v_active
    )
    RETURNING id INTO v_id;
  END IF;

  v_result := jsonb_build_object(
    'ruleId', v_id,
    'name', v_name,
    'priority', v_priority,
    'matchType', v_match_type,
    'active', v_active
  );

  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. delete_reconciliation_rule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_reconciliation_rule(
  p_idempotency_key text,
  p_rule_id text
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
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_rule_id IS NULL OR char_length(trim(p_rule_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'rule id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('ruleId', trim(p_rule_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'delete_reconciliation_rule', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  DELETE FROM public.reconciliation_rules
  WHERE company_id = v_ctx.company_id
    AND id = trim(p_rule_id);

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'reconciliation rule not found');
  END IF;

  v_result := jsonb_build_object('ruleId', trim(p_rule_id), 'deleted', true);
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. skip_bank_statement_line
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.skip_bank_statement_line(
  p_idempotency_key text,
  p_line_id text
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
  v_line public.bank_statement_lines%ROWTYPE;
  v_session public.reconciliation_sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_line_id IS NULL OR char_length(trim(p_line_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'line id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('lineId', trim(p_line_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'skip_bank_statement_line', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT l.*
  INTO v_line
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_ctx.company_id
    AND l.id = trim(p_line_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank statement line not found');
  END IF;

  IF v_line.status = 'matched' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line already matched');
  END IF;

  IF v_line.status = 'ignored' THEN
    v_result := jsonb_build_object(
      'lineId', v_line.id,
      'statementId', v_line.bank_statement_id,
      'status', 'ignored'
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  v_session := public.ensure_reconciliation_session(v_line.bank_statement_id);
  PERFORM public._mark_statement_reconciling(
    v_ctx.company_id, v_line.bank_statement_id
  );

  UPDATE public.bank_statement_lines
  SET status = 'ignored'
  WHERE company_id = v_ctx.company_id
    AND id = v_line.id;

  -- Drop open suggestions for this line.
  UPDATE public.reconciliation_matches
  SET status = 'rejected'
  WHERE company_id = v_ctx.company_id
    AND bank_statement_line_id = v_line.id
    AND status = 'suggested';

  v_result := jsonb_build_object(
    'lineId', v_line.id,
    'statementId', v_line.bank_statement_id,
    'sessionId', v_session.id,
    'status', 'ignored'
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. manual_reconciliation_match
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manual_reconciliation_match(
  p_idempotency_key text,
  p_line_id text,
  p_journal_entry_id text DEFAULT NULL,
  p_source_doc_type text DEFAULT NULL,
  p_source_doc_id text DEFAULT NULL
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
  v_line public.bank_statement_lines%ROWTYPE;
  v_session public.reconciliation_sessions%ROWTYPE;
  v_match_id text;
  v_je text := nullif(trim(p_journal_entry_id), '');
  v_src_type text := nullif(trim(p_source_doc_type), '');
  v_src_id text := nullif(trim(p_source_doc_id), '');
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_line_id IS NULL OR char_length(trim(p_line_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'line id required');
  END IF;

  IF v_je IS NULL AND (v_src_type IS NULL OR v_src_id IS NULL) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'journal entry or source document required'
    );
  END IF;
  IF (v_src_type IS NULL) <> (v_src_id IS NULL) THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'source_doc_type and source_doc_id must be supplied together'
    );
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'lineId', trim(p_line_id),
      'journalEntryId', v_je,
      'sourceDocType', v_src_type,
      'sourceDocId', v_src_id
    )
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'manual_reconciliation_match', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT l.*
  INTO v_line
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_ctx.company_id
    AND l.id = trim(p_line_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank statement line not found');
  END IF;

  IF v_line.status = 'matched' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line already matched');
  END IF;
  IF v_line.status = 'ignored' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line is ignored');
  END IF;

  IF v_je IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.journal_entries AS je
    WHERE je.company_id = v_ctx.company_id
      AND je.id = v_je
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'journal entry not found');
  END IF;

  v_session := public.ensure_reconciliation_session(v_line.bank_statement_id);
  PERFORM public._mark_statement_reconciling(
    v_ctx.company_id, v_line.bank_statement_id
  );

  UPDATE public.reconciliation_matches
  SET status = 'rejected'
  WHERE company_id = v_ctx.company_id
    AND bank_statement_line_id = v_line.id
    AND status = 'suggested';

  INSERT INTO public.reconciliation_matches (
    company_id,
    reconciliation_session_id,
    bank_statement_line_id,
    journal_entry_id,
    source_doc_type,
    source_doc_id,
    status,
    proposed_by,
    created_by
  )
  VALUES (
    v_ctx.company_id,
    v_session.id,
    v_line.id,
    v_je,
    v_src_type,
    v_src_id,
    'manual',
    'user',
    v_ctx.user_id
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_lines
  SET status = 'matched'
  WHERE company_id = v_ctx.company_id
    AND id = v_line.id;

  v_result := jsonb_build_object(
    'matchId', v_match_id,
    'lineId', v_line.id,
    'statementId', v_line.bank_statement_id,
    'sessionId', v_session.id,
    'status', 'manual',
    'lineStatus', 'matched'
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. accept_reconciliation_match (M17 exclusive owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_reconciliation_match(
  p_idempotency_key text,
  p_match_id text
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
  v_match public.reconciliation_matches%ROWTYPE;
  v_line public.bank_statement_lines%ROWTYPE;
  v_session public.reconciliation_sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_match_id IS NULL OR char_length(trim(p_match_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'match id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('matchId', trim(p_match_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'accept_reconciliation_match', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT m.*
  INTO v_match
  FROM public.reconciliation_matches AS m
  WHERE m.company_id = v_ctx.company_id
    AND m.id = trim(p_match_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'reconciliation match not found');
  END IF;

  SELECT l.*
  INTO v_line
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_ctx.company_id
    AND l.id = v_match.bank_statement_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank statement line not found');
  END IF;

  IF v_line.status = 'matched' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line already matched');
  END IF;
  IF v_line.status = 'ignored' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line is ignored');
  END IF;

  IF v_match.status = 'accepted' THEN
    v_result := jsonb_build_object(
      'matchId', v_match.id,
      'lineId', v_line.id,
      'status', 'accepted',
      'lineStatus', 'matched'
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  IF v_match.status <> 'suggested' THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'only suggested matches can be accepted'
    );
  END IF;

  v_session := public.ensure_reconciliation_session(v_line.bank_statement_id);
  PERFORM public._mark_statement_reconciling(
    v_ctx.company_id, v_line.bank_statement_id
  );

  UPDATE public.reconciliation_matches
  SET status = 'accepted'
  WHERE company_id = v_ctx.company_id
    AND id = v_match.id;

  UPDATE public.reconciliation_matches
  SET status = 'rejected'
  WHERE company_id = v_ctx.company_id
    AND bank_statement_line_id = v_line.id
    AND id <> v_match.id
    AND status = 'suggested';

  UPDATE public.bank_statement_lines
  SET status = 'matched'
  WHERE company_id = v_ctx.company_id
    AND id = v_line.id;

  v_result := jsonb_build_object(
    'matchId', v_match.id,
    'lineId', v_line.id,
    'statementId', v_line.bank_statement_id,
    'sessionId', v_session.id,
    'status', 'accepted',
    'lineStatus', 'matched'
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. reject_reconciliation_match
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_reconciliation_match(
  p_idempotency_key text,
  p_match_id text
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
  v_match public.reconciliation_matches%ROWTYPE;
  v_line public.bank_statement_lines%ROWTYPE;
  v_other_suggested boolean;
  v_line_status text;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_match_id IS NULL OR char_length(trim(p_match_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'match id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('matchId', trim(p_match_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'reject_reconciliation_match', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT m.*
  INTO v_match
  FROM public.reconciliation_matches AS m
  WHERE m.company_id = v_ctx.company_id
    AND m.id = trim(p_match_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'reconciliation match not found');
  END IF;

  SELECT l.*
  INTO v_line
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_ctx.company_id
    AND l.id = v_match.bank_statement_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank statement line not found');
  END IF;

  IF v_match.status = 'rejected' THEN
    v_result := jsonb_build_object(
      'matchId', v_match.id,
      'lineId', v_line.id,
      'status', 'rejected',
      'lineStatus', v_line.status
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  IF v_match.status <> 'suggested' THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'only suggested matches can be rejected'
    );
  END IF;

  IF v_line.status = 'matched' THEN
    PERFORM public.raise_write_error('CONFLICT', 'line already matched');
  END IF;

  UPDATE public.reconciliation_matches
  SET status = 'rejected'
  WHERE company_id = v_ctx.company_id
    AND id = v_match.id;

  SELECT EXISTS (
    SELECT 1
    FROM public.reconciliation_matches AS m2
    WHERE m2.company_id = v_ctx.company_id
      AND m2.bank_statement_line_id = v_line.id
      AND m2.status = 'suggested'
  )
  INTO v_other_suggested;

  IF v_line.status = 'suggested' AND NOT v_other_suggested THEN
    UPDATE public.bank_statement_lines
    SET status = 'unmatched'
    WHERE company_id = v_ctx.company_id
      AND id = v_line.id;
    v_line_status := 'unmatched';
  ELSE
    v_line_status := v_line.status;
  END IF;

  v_result := jsonb_build_object(
    'matchId', v_match.id,
    'lineId', v_line.id,
    'status', 'rejected',
    'lineStatus', v_line_status
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. complete_reconciliation_session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_reconciliation_session(
  p_idempotency_key text,
  p_statement_id text
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
  v_session public.reconciliation_sessions%ROWTYPE;
  v_open_count integer;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_statement_id IS NULL OR char_length(trim(p_statement_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'statement id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('statementId', trim(p_statement_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'complete_reconciliation_session', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_statements AS s
    WHERE s.company_id = v_ctx.company_id
      AND s.id = trim(p_statement_id)
  ) THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'bank statement not found');
  END IF;

  SELECT r.*
  INTO v_session
  FROM public.reconciliation_sessions AS r
  WHERE r.company_id = v_ctx.company_id
    AND r.bank_statement_id = trim(p_statement_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Ensure creates open session; then we validate lines before completing.
    v_session := public.ensure_reconciliation_session(trim(p_statement_id));

    SELECT r.*
    INTO v_session
    FROM public.reconciliation_sessions AS r
    WHERE r.company_id = v_ctx.company_id
      AND r.id = v_session.id
    FOR UPDATE;
  END IF;

  IF v_session.status = 'completed' THEN
    v_result := jsonb_build_object(
      'sessionId', v_session.id,
      'statementId', trim(p_statement_id),
      'status', 'completed'
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  IF v_session.status <> 'open' THEN
    PERFORM public.raise_write_error('CONFLICT', 'session is not open');
  END IF;

  SELECT count(*)::integer
  INTO v_open_count
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_ctx.company_id
    AND l.bank_statement_id = trim(p_statement_id)
    AND l.status NOT IN ('matched', 'ignored');

  IF v_open_count > 0 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'all lines must be matched or ignored before completing'
    );
  END IF;

  UPDATE public.reconciliation_sessions
  SET status = 'completed',
      completed_by = v_ctx.user_id,
      completed_at = now()
  WHERE company_id = v_ctx.company_id
    AND id = v_session.id;

  UPDATE public.bank_statements
  SET status = 'reconciled'
  WHERE company_id = v_ctx.company_id
    AND id = trim(p_statement_id);

  v_result := jsonb_build_object(
    'sessionId', v_session.id,
    'statementId', trim(p_statement_id),
    'status', 'completed',
    'statementStatus', 'reconciled'
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. start_period_close
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_period_close(
  p_idempotency_key text,
  p_fiscal_period_id text
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
  v_run_id text;
  v_tasks_inserted integer;
  v_run public.period_close_runs%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_fiscal_period_id IS NULL OR char_length(trim(p_fiscal_period_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'fiscal period id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('fiscalPeriodId', trim(p_fiscal_period_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'start_period_close', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_run_id := public.ensure_period_close_run(
    v_ctx.company_id, trim(p_fiscal_period_id), v_ctx.user_id
  );
  v_tasks_inserted := public.ensure_period_close_tasks(v_run_id);

  SELECT pcr.*
  INTO v_run
  FROM public.period_close_runs AS pcr
  WHERE pcr.company_id = v_ctx.company_id
    AND pcr.id = v_run_id
  FOR UPDATE;

  IF v_run.status IN ('completed', 'cancelled') THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'period close run is already ' || v_run.status
    );
  END IF;

  IF v_run.status <> 'in_progress' THEN
    UPDATE public.period_close_runs
    SET status = 'in_progress',
        started_by = coalesce(started_by, v_ctx.user_id),
        started_at = coalesce(started_at, now())
    WHERE company_id = v_ctx.company_id
      AND id = v_run_id
    RETURNING * INTO v_run;
  END IF;

  v_result := jsonb_build_object(
    'runId', v_run.id,
    'fiscalPeriodId', v_run.fiscal_period_id,
    'status', v_run.status,
    'tasksInserted', v_tasks_inserted
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. rescan_period_close
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rescan_period_close(
  p_idempotency_key text,
  p_fiscal_period_id text
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
  v_run_id text;
  v_tasks_inserted integer;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_fiscal_period_id IS NULL OR char_length(trim(p_fiscal_period_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'fiscal period id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('fiscalPeriodId', trim(p_fiscal_period_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'rescan_period_close', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  v_run_id := public.ensure_period_close_run(
    v_ctx.company_id, trim(p_fiscal_period_id), v_ctx.user_id
  );
  v_tasks_inserted := public.ensure_period_close_tasks(v_run_id);

  v_result := jsonb_build_object(
    'runId', v_run_id,
    'fiscalPeriodId', trim(p_fiscal_period_id),
    'tasksInserted', v_tasks_inserted
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. complete_period_close_task
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_period_close_task(
  p_idempotency_key text,
  p_task_id text,
  p_status text DEFAULT 'completed'
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
  v_task public.period_close_tasks%ROWTYPE;
  v_run public.period_close_runs%ROWTYPE;
  v_status text := lower(trim(coalesce(p_status, 'completed')));
  v_pending integer;
  v_run_completed boolean := false;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_task_id IS NULL OR char_length(trim(p_task_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'task id required');
  END IF;

  IF v_status NOT IN ('completed', 'skipped') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'status must be completed or skipped'
    );
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('taskId', trim(p_task_id), 'status', v_status)
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'complete_period_close_task', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT t.*
  INTO v_task
  FROM public.period_close_tasks AS t
  WHERE t.company_id = v_ctx.company_id
    AND t.id = trim(p_task_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'period close task not found');
  END IF;

  SELECT pcr.*
  INTO v_run
  FROM public.period_close_runs AS pcr
  WHERE pcr.company_id = v_ctx.company_id
    AND pcr.id = v_task.period_close_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'period close run not found');
  END IF;

  IF v_run.status IN ('completed', 'cancelled') THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'period close run is already ' || v_run.status
    );
  END IF;

  IF v_task.status NOT IN ('completed', 'skipped')
    OR v_task.status IS DISTINCT FROM v_status THEN
    UPDATE public.period_close_tasks
    SET status = v_status,
        completed_at = now()
    WHERE company_id = v_ctx.company_id
      AND id = v_task.id
    RETURNING * INTO v_task;
  END IF;

  SELECT count(*)::integer
  INTO v_pending
  FROM public.period_close_tasks AS t
  WHERE t.company_id = v_ctx.company_id
    AND t.period_close_run_id = v_run.id
    AND t.status NOT IN ('completed', 'skipped');

  IF v_pending = 0 THEN
    UPDATE public.period_close_runs
    SET status = 'completed',
        completed_by = v_ctx.user_id,
        completed_at = now()
    WHERE company_id = v_ctx.company_id
      AND id = v_run.id;
    v_run_completed := true;
  ELSIF v_run.status = 'open' THEN
    UPDATE public.period_close_runs
    SET status = 'in_progress',
        started_by = coalesce(started_by, v_ctx.user_id),
        started_at = coalesce(started_at, now())
    WHERE company_id = v_ctx.company_id
      AND id = v_run.id;
  END IF;

  v_result := jsonb_build_object(
    'taskId', v_task.id,
    'runId', v_run.id,
    'taskStatus', v_task.status,
    'runCompleted', v_run_completed
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. set_fiscal_period_status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_fiscal_period_status(
  p_idempotency_key text,
  p_fiscal_period_id text,
  p_status text
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
  v_period public.fiscal_periods%ROWTYPE;
  v_new text := lower(trim(p_status));
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_fiscal_period_id IS NULL OR char_length(trim(p_fiscal_period_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'fiscal period id required');
  END IF;

  IF v_new NOT IN ('open', 'soft_closed', 'hard_closed') THEN
    PERFORM public.raise_write_error(
      'VALIDATION',
      'status must be open, soft_closed, or hard_closed'
    );
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object(
      'fiscalPeriodId', trim(p_fiscal_period_id),
      'status', v_new
    )
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'set_fiscal_period_status', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT fp.*
  INTO v_period
  FROM public.fiscal_periods AS fp
  WHERE fp.company_id = v_ctx.company_id
    AND fp.id = trim(p_fiscal_period_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'fiscal period not found');
  END IF;

  IF v_period.status = v_new THEN
    v_result := jsonb_build_object(
      'fiscalPeriodId', v_period.id,
      'year', v_period.year,
      'month', v_period.month,
      'status', v_period.status
    );
    PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
    RETURN v_result;
  END IF;

  -- Legal transitions:
  --   open → soft_closed → hard_closed
  --   soft_closed → open (accountant)
  --   hard_closed → open requires admin capability
  IF v_period.status = 'open' AND v_new = 'soft_closed' THEN
    NULL;
  ELSIF v_period.status = 'soft_closed' AND v_new = 'hard_closed' THEN
    NULL;
  ELSIF v_period.status = 'open' AND v_new = 'hard_closed' THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'open periods must soft_close before hard_close'
    );
  ELSIF v_period.status = 'soft_closed' AND v_new = 'open' THEN
    NULL;
  ELSIF v_period.status = 'hard_closed' AND v_new = 'open' THEN
    PERFORM public.assert_write_capability('admin');
  ELSIF v_period.status = 'hard_closed' AND v_new = 'soft_closed' THEN
    PERFORM public.raise_write_error(
      'CONFLICT',
      'hard_closed periods cannot move to soft_closed'
    );
  ELSE
    PERFORM public.raise_write_error(
      'CONFLICT',
      'illegal fiscal period transition from '
        || v_period.status || ' to ' || v_new
    );
  END IF;

  UPDATE public.fiscal_periods
  SET status = v_new
  WHERE company_id = v_ctx.company_id
    AND id = v_period.id
  RETURNING * INTO v_period;

  v_result := jsonb_build_object(
    'fiscalPeriodId', v_period.id,
    'year', v_period.year,
    'month', v_period.month,
    'status', v_period.status
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. close_fiscal_year
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_idempotency_key text,
  p_year integer
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
  v_period_count integer;
  v_open_count integer;
  v_hard_closed integer;
  v_result jsonb;
BEGIN
  PERFORM public.assert_write_capability('accountant');
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2200 THEN
    PERFORM public.raise_write_error('VALIDATION', 'year must be between 2000 and 2200');
  END IF;

  v_hash := public.request_hash_from_json(jsonb_build_object('year', p_year));
  v_claim := public.claim_write_command(
    p_idempotency_key, 'close_fiscal_year', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  SELECT count(*)::integer
  INTO v_period_count
  FROM public.fiscal_periods AS fp
  WHERE fp.company_id = v_ctx.company_id
    AND fp.year = p_year;

  IF v_period_count <> 12 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'all 12 fiscal periods for the year must exist'
    );
  END IF;

  SELECT count(*)::integer
  INTO v_open_count
  FROM public.fiscal_periods AS fp
  WHERE fp.company_id = v_ctx.company_id
    AND fp.year = p_year
    AND fp.status = 'open';

  IF v_open_count > 0 THEN
    PERFORM public.raise_write_error(
      'INVARIANT',
      'all periods must be at least soft_closed before year close'
    );
  END IF;

  UPDATE public.fiscal_periods
  SET status = 'hard_closed'
  WHERE company_id = v_ctx.company_id
    AND year = p_year
    AND status = 'soft_closed';

  GET DIAGNOSTICS v_hard_closed = ROW_COUNT;

  v_result := jsonb_build_object(
    'year', p_year,
    'periodsHardClosed', v_hard_closed,
    'status', 'hard_closed'
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. mark_inbox_notification_read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_inbox_notification_read(
  p_idempotency_key text,
  p_notification_id text
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
  v_result jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.require_company_context();

  IF p_notification_id IS NULL OR char_length(trim(p_notification_id)) = 0 THEN
    PERFORM public.raise_write_error('VALIDATION', 'notification id required');
  END IF;

  v_hash := public.request_hash_from_json(
    jsonb_build_object('notificationId', trim(p_notification_id))
  );
  v_claim := public.claim_write_command(
    p_idempotency_key, 'mark_inbox_notification_read', v_hash, NULL, NULL
  );
  IF (v_claim ->> 'replay')::boolean THEN
    RETURN v_claim -> 'result';
  END IF;

  PERFORM public.mark_notification_read(trim(p_notification_id));

  v_result := jsonb_build_object(
    'notificationId', trim(p_notification_id),
    'read', true
  );
  PERFORM public.complete_write_command(v_claim ->> 'commandId', v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._mark_statement_reconciling(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mark_statement_reconciling(text, text)
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.import_bank_statement(text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_reconciliation_rule(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_reconciliation_rule(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_bank_statement_line(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manual_reconciliation_match(text, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_reconciliation_match(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_reconciliation_match(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_reconciliation_session(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_period_close(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rescan_period_close(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_period_close_task(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_fiscal_period_status(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_fiscal_year(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_inbox_notification_read(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.import_bank_statement(text, jsonb, jsonb, jsonb)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_reconciliation_rule(text, jsonb)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_reconciliation_rule(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_bank_statement_line(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_reconciliation_match(text, text, text, text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_reconciliation_match(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_reconciliation_match(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_reconciliation_session(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.start_period_close(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rescan_period_close(text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_period_close_task(text, text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_fiscal_period_status(text, text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.close_fiscal_year(text, integer)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_inbox_notification_read(text, text)
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.import_bank_statement(text, jsonb, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_reconciliation_rule(text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reconciliation_rule(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.skip_bank_statement_line(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_reconciliation_match(text, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_reconciliation_match(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_reconciliation_match(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reconciliation_session(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_period_close(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescan_period_close(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_period_close_task(text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_fiscal_period_status(text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inbox_notification_read(text, text)
  TO authenticated;
