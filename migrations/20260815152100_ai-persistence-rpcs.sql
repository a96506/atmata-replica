-- Phase 3 AI persistence RPCs.
-- Does not alter 20260815151000_functions-support.sql.
-- Authenticated users remain SELECT-only on AI tables; mutations go through
-- these SECURITY DEFINER RPCs. Stamp sits after read-contracts and before the
-- reserved platform-admin stamp 20260815153000.

CREATE OR REPLACE FUNCTION public.persist_ai_suggestion(
  p_scope_kind text,
  p_scope_type text DEFAULT NULL,
  p_scope_id text DEFAULT NULL,
  p_category text DEFAULT 'efficiency',
  p_severity text DEFAULT 'info',
  p_title_en text DEFAULT NULL,
  p_title_ar text DEFAULT NULL,
  p_rationale_en text DEFAULT NULL,
  p_rationale_ar text DEFAULT NULL,
  p_confidence numeric DEFAULT 0,
  p_proposed_action jsonb DEFAULT '{}'::jsonb,
  p_model text DEFAULT NULL,
  p_prompt_version text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.ai_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_row public.ai_suggestions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  INSERT INTO public.ai_suggestions (
    company_id,
    scope_kind,
    scope_type,
    scope_id,
    category,
    severity,
    title_en,
    title_ar,
    rationale_en,
    rationale_ar,
    confidence,
    proposed_action,
    model,
    prompt_version,
    created_by,
    expires_at
  )
  VALUES (
    v_company_id,
    p_scope_kind,
    nullif(trim(p_scope_type), ''),
    nullif(trim(p_scope_id), ''),
    p_category,
    p_severity,
    trim(p_title_en),
    trim(p_title_ar),
    trim(p_rationale_en),
    trim(p_rationale_ar),
    p_confidence,
    coalesce(p_proposed_action, '{}'::jsonb),
    trim(p_model),
    trim(p_prompt_version),
    v_user_id,
    p_expires_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_ai_suggestion(p_suggestion_id text)
RETURNS public.ai_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_row public.ai_suggestions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  SELECT s.*
  INTO v_row
  FROM public.ai_suggestions AS s
  WHERE s.company_id = v_company_id
    AND s.id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI suggestion not found';
  END IF;

  IF v_row.status = 'dismissed' THEN
    RETURN v_row;
  END IF;

  IF v_row.status NOT IN ('active', 'queued') THEN
    RAISE EXCEPTION 'AI suggestion cannot be dismissed';
  END IF;

  UPDATE public.ai_suggestions
  SET status = 'dismissed'
  WHERE company_id = v_company_id
    AND id = p_suggestion_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_reconciliation_session(p_statement_id text)
RETURNS public.reconciliation_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_row public.reconciliation_sessions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF p_statement_id IS NULL OR char_length(trim(p_statement_id)) = 0 THEN
    RAISE EXCEPTION 'statement id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_statements AS s
    WHERE s.company_id = v_company_id
      AND s.id = p_statement_id
  ) THEN
    RAISE EXCEPTION 'bank statement not found';
  END IF;

  SELECT r.*
  INTO v_row
  FROM public.reconciliation_sessions AS r
  WHERE r.company_id = v_company_id
    AND r.bank_statement_id = p_statement_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.status <> 'open' THEN
      RAISE EXCEPTION 'reconciliation session is not open';
    END IF;
    RETURN v_row;
  END IF;

  INSERT INTO public.reconciliation_sessions (
    company_id,
    bank_statement_id,
    status,
    started_by
  )
  VALUES (
    v_company_id,
    p_statement_id,
    'open',
    v_user_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_reconciliation_suggestion(
  p_statement_id text,
  p_line_id text,
  p_journal_entry_id text DEFAULT NULL,
  p_source_doc_type text DEFAULT NULL,
  p_source_doc_id text DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_title_en text DEFAULT NULL,
  p_title_ar text DEFAULT NULL,
  p_rationale_en text DEFAULT NULL,
  p_rationale_ar text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_prompt_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_session public.reconciliation_sessions%ROWTYPE;
  v_line public.bank_statement_lines%ROWTYPE;
  v_match public.reconciliation_matches%ROWTYPE;
  v_suggestion public.ai_suggestions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  v_session := public.ensure_reconciliation_session(p_statement_id);

  SELECT l.*
  INTO v_line
  FROM public.bank_statement_lines AS l
  WHERE l.company_id = v_company_id
    AND l.id = p_line_id
  FOR UPDATE;

  IF NOT FOUND OR v_line.bank_statement_id IS DISTINCT FROM p_statement_id THEN
    RAISE EXCEPTION 'bank statement line not found';
  END IF;
  IF v_line.status = 'matched' THEN
    RAISE EXCEPTION 'bank statement line already matched';
  END IF;

  IF p_journal_entry_id IS NOT NULL THEN
    SELECT m.*
    INTO v_match
    FROM public.reconciliation_matches AS m
    WHERE m.company_id = v_company_id
      AND m.bank_statement_line_id = p_line_id
      AND m.journal_entry_id = p_journal_entry_id
    FOR UPDATE;
  END IF;

  IF v_match.id IS NULL THEN
    INSERT INTO public.reconciliation_matches (
      company_id,
      reconciliation_session_id,
      bank_statement_line_id,
      journal_entry_id,
      source_doc_type,
      source_doc_id,
      confidence,
      status,
      proposed_by,
      created_by
    )
    VALUES (
      v_company_id,
      v_session.id,
      p_line_id,
      nullif(trim(p_journal_entry_id), ''),
      nullif(trim(p_source_doc_type), ''),
      nullif(trim(p_source_doc_id), ''),
      p_confidence,
      'suggested',
      'ai',
      v_user_id
    )
    RETURNING * INTO v_match;
  ELSIF v_match.status IN ('accepted', 'manual') THEN
    RAISE EXCEPTION 'reconciliation match already accepted';
  END IF;

  IF v_line.status = 'unmatched' THEN
    UPDATE public.bank_statement_lines
    SET status = 'suggested'
    WHERE company_id = v_company_id
      AND id = p_line_id;
  END IF;

  v_suggestion := public.persist_ai_suggestion(
    p_scope_kind => 'reconciliation',
    p_scope_type => 'reconciliation_match',
    p_scope_id => v_match.id,
    p_category => 'reconciliation',
    p_severity => 'info',
    p_title_en => p_title_en,
    p_title_ar => p_title_ar,
    p_rationale_en => p_rationale_en,
    p_rationale_ar => p_rationale_ar,
    p_confidence => coalesce(p_confidence, 0),
    p_proposed_action => jsonb_build_object(
      'label', 'Review match',
      'matchId', v_match.id
    ),
    p_model => p_model,
    p_prompt_version => p_prompt_version
  );

  RETURN jsonb_build_object(
    'match', to_jsonb(v_match),
    'suggestion', to_jsonb(v_suggestion)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_ai_suggestion(
  text, text, text, text, text, text, text, text, text, numeric, jsonb, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_ai_suggestion(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_reconciliation_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_reconciliation_suggestion(
  text, text, text, text, text, numeric, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.persist_ai_suggestion(
  text, text, text, text, text, text, text, text, text, numeric, jsonb, text, text, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_ai_suggestion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_reconciliation_session(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_reconciliation_suggestion(
  text, text, text, text, text, numeric, text, text, text, text, text, text
) TO authenticated;
