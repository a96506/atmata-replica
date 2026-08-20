-- M18 — scheduled operations (service-mode RPCs + alert/depreciation schema).
-- Dispatcher is the erp-scheduler edge function. Business mutations stay here.
-- Service RPCs take explicit p_company_id, never my_company_id()/user roles.
-- Function-local search_path only; no session SET. Reuses M13 ensure_period_close_*.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.scheduled_job_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_name text NOT NULL CHECK (
    job_name IN (
      'fx_ingest', 'aging_refresh', 'stale_drafts',
      'month_end', 'inventory_alerts', 'depreciation'
    )
  ),
  run_key text NOT NULL CHECK (char_length(trim(run_key)) > 0),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  UNIQUE (company_id, id),
  UNIQUE (company_id, job_name, run_key)
);

CREATE INDEX scheduled_job_runs_job_status_idx
  ON public.scheduled_job_runs (job_name, status, started_at DESC);

CREATE TABLE public.operational_alerts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN (
      'stale_draft', 'reorder', 'abc', 'schedule_failure',
      'fx_stale', 'depreciation_blocked'
    )
  ),
  subject_type text,
  subject_id text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  dedupe_key text NOT NULL CHECK (char_length(trim(dedupe_key)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, dedupe_key),
  CHECK ((subject_type IS NULL) = (subject_id IS NULL))
);

CREATE INDEX operational_alerts_open_idx
  ON public.operational_alerts (company_id, kind, status)
  WHERE status = 'open';

CREATE TABLE public.asset_depreciation_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fixed_asset_id text NOT NULL,
  fiscal_period_id text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  posting_date date NOT NULL,
  journal_entry_id text,
  run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, fixed_asset_id, fiscal_period_id),
  FOREIGN KEY (company_id, fixed_asset_id)
    REFERENCES public.fixed_assets (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, fiscal_period_id)
    REFERENCES public.fiscal_periods (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, journal_entry_id)
    REFERENCES public.journal_entries (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, run_id)
    REFERENCES public.scheduled_job_runs (company_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX journal_entries_asset_depreciation_uidx
  ON public.journal_entries (company_id, source_type, source_id)
  WHERE source_type = 'asset_depreciation';

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS operational_alert_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_operational_alert_fk'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_operational_alert_fk
      FOREIGN KEY (company_id, operational_alert_id)
      REFERENCES public.operational_alerts (company_id, id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_alert_key'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_recipient_alert_key
      UNIQUE (recipient_user_id, operational_alert_id);
  END IF;
END;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS abc_class text,
  ADD COLUMN IF NOT EXISTS abc_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_abc_class_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_abc_class_check
      CHECK (abc_class IS NULL OR abc_class IN ('A', 'B', 'C'));
  END IF;
END;
$$;

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS in_service_date date,
  ADD COLUMN IF NOT EXISTS depreciation_method text,
  ADD COLUMN IF NOT EXISTS depreciation_convention text;

UPDATE public.fixed_assets
SET in_service_date = acquisition_date
WHERE in_service_date IS NULL;

UPDATE public.fixed_assets
SET depreciation_method = 'straight_line'
WHERE depreciation_method IS NULL;

UPDATE public.fixed_assets
SET depreciation_convention = 'full_month'
WHERE depreciation_convention IS NULL;

ALTER TABLE public.fixed_assets
  ALTER COLUMN in_service_date SET NOT NULL,
  ALTER COLUMN depreciation_method SET NOT NULL,
  ALTER COLUMN depreciation_method SET DEFAULT 'straight_line',
  ALTER COLUMN depreciation_convention SET NOT NULL,
  ALTER COLUMN depreciation_convention SET DEFAULT 'full_month';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_depreciation_method_check'
  ) THEN
    ALTER TABLE public.fixed_assets
      ADD CONSTRAINT fixed_assets_depreciation_method_check
      CHECK (depreciation_method = 'straight_line');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_depreciation_convention_check'
  ) THEN
    ALTER TABLE public.fixed_assets
      ADD CONSTRAINT fixed_assets_depreciation_convention_check
      CHECK (depreciation_convention = 'full_month');
  END IF;
END;
$$;

SELECT public.apply_company_access('scheduled_job_runs');
SELECT public.apply_company_access('operational_alerts');
SELECT public.apply_company_access('asset_depreciation_entries');

DROP TRIGGER IF EXISTS operational_alerts_set_updated_at ON public.operational_alerts;
CREATE TRIGGER operational_alerts_set_updated_at
  BEFORE UPDATE ON public.operational_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_table_manifest (table_name)
VALUES
  ('scheduled_job_runs'),
  ('operational_alerts'),
  ('asset_depreciation_entries')
ON CONFLICT (table_name) DO NOTHING;

REVOKE INSERT, UPDATE, DELETE ON public.scheduled_job_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.operational_alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.asset_depreciation_entries FROM anon, authenticated;
GRANT SELECT ON public.scheduled_job_runs TO authenticated;
GRANT SELECT ON public.operational_alerts TO authenticated;
GRANT SELECT ON public.asset_depreciation_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kuwait_business_ts()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT timezone('Asia/Kuwait', now());
$$;

CREATE OR REPLACE FUNCTION public.kuwait_business_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.kuwait_business_ts()::date;
$$;

CREATE OR REPLACE FUNCTION public.raise_schedule_error(p_code text, p_message text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE:%:%', p_code, p_message
    USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_period_open_for_service(
  p_company_id text,
  p_posting_date date,
  p_allow_adjust boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_period public.fiscal_periods%ROWTYPE;
BEGIN
  -- Service mode never impersonates period_adjust; p_allow_adjust is ignored.
  PERFORM p_allow_adjust;

  SELECT *
  INTO v_period
  FROM public.fiscal_periods
  WHERE company_id = p_company_id
    AND p_posting_date BETWEEN "start" AND "end"
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.raise_schedule_error('PERIOD_MISSING', 'no fiscal period for posting date');
  END IF;
  IF v_period.status <> 'open' THEN
    PERFORM public.raise_schedule_error(
      'PERIOD_CLOSED',
      'fiscal period is ' || v_period.status
    );
  END IF;
  RETURN v_period.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_scheduled_job(
  p_company_id text,
  p_job_name text,
  p_run_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.scheduled_job_runs%ROWTYPE;
  v_lock_key bigint;
BEGIN
  IF p_company_id IS NULL OR p_job_name IS NULL OR p_run_key IS NULL THEN
    PERFORM public.raise_schedule_error('VALIDATION', 'company, job, and run key required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = p_company_id AND status = 'active'
  ) THEN
    PERFORM public.raise_schedule_error('NOT_FOUND', 'active company not found');
  END IF;

  v_lock_key := pg_catalog.hashtextextended(
    p_company_id || ':' || p_job_name || ':' || p_run_key,
    0
  );
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'lock_held');
  END IF;

  SELECT * INTO v_run
  FROM public.scheduled_job_runs
  WHERE company_id = p_company_id
    AND job_name = p_job_name
    AND run_key = p_run_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_run.status = 'succeeded' THEN
      RETURN jsonb_build_object(
        'status', 'skipped',
        'reason', 'already_succeeded',
        'runId', v_run.id,
        'attempt', v_run.attempt
      );
    END IF;
    IF v_run.status = 'running'
       AND v_run.heartbeat_at > now() - interval '30 minutes' THEN
      RETURN jsonb_build_object(
        'status', 'skipped',
        'reason', 'in_progress',
        'runId', v_run.id,
        'attempt', v_run.attempt
      );
    END IF;

    UPDATE public.scheduled_job_runs
    SET status = 'running',
        attempt = v_run.attempt + 1,
        started_at = now(),
        heartbeat_at = now(),
        completed_at = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE company_id = p_company_id
      AND id = v_run.id
    RETURNING * INTO v_run;
  ELSE
    INSERT INTO public.scheduled_job_runs (
      company_id, job_name, run_key, status, attempt
    )
    VALUES (p_company_id, p_job_name, p_run_key, 'running', 1)
    RETURNING * INTO v_run;
  END IF;

  RETURN jsonb_build_object(
    'status', 'running',
    'runId', v_run.id,
    'attempt', v_run.attempt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_scheduled_job(
  p_company_id text,
  p_run_id text,
  p_status text,
  p_metrics jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.scheduled_job_runs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'skipped') THEN
    PERFORM public.raise_schedule_error('VALIDATION', 'invalid finish status');
  END IF;

  UPDATE public.scheduled_job_runs
  SET status = p_status,
      heartbeat_at = now(),
      completed_at = now(),
      metrics = coalesce(p_metrics, '{}'::jsonb),
      error_code = p_error_code,
      error_message = left(p_error_message, 500)
  WHERE company_id = p_company_id
    AND id = p_run_id
  RETURNING * INTO v_run;

  IF NOT FOUND THEN
    PERFORM public.raise_schedule_error('NOT_FOUND', 'scheduled job run not found');
  END IF;

  RETURN jsonb_build_object(
    'status', v_run.status,
    'runId', v_run.id,
    'metrics', v_run.metrics
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fanout_operational_alert(
  p_company_id text,
  p_alert_id text,
  VARIADIC p_roles text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_alert public.operational_alerts%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_alert
  FROM public.operational_alerts
  WHERE company_id = p_company_id AND id = p_alert_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (
    company_id,
    recipient_user_id,
    kind,
    title,
    body,
    doc_type,
    doc_id,
    operational_alert_id
  )
  SELECT
    p_company_id,
    cm.user_id,
    'system',
    v_alert.kind,
    coalesce(v_alert.payload ->> 'summary', v_alert.dedupe_key),
    v_alert.subject_type,
    v_alert.subject_id,
    v_alert.id
  FROM public.company_members AS cm
  WHERE cm.company_id = p_company_id
    AND cm.active
    AND cm.roles && p_roles
  ON CONFLICT (recipient_user_id, operational_alert_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_operational_alert(
  p_company_id text,
  p_kind text,
  p_dedupe_key text,
  p_severity text,
  p_subject_type text,
  p_subject_id text,
  p_payload jsonb,
  p_roles text[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing public.operational_alerts%ROWTYPE;
  v_id text;
  v_reopened boolean := false;
  v_opened boolean := false;
BEGIN
  SELECT * INTO v_existing
  FROM public.operational_alerts
  WHERE company_id = p_company_id
    AND dedupe_key = p_dedupe_key
  FOR UPDATE;

  IF FOUND THEN
    v_id := v_existing.id;
    v_reopened := v_existing.status = 'resolved';
    UPDATE public.operational_alerts
    SET kind = p_kind,
        severity = p_severity,
        subject_type = p_subject_type,
        subject_id = p_subject_id,
        payload = coalesce(p_payload, '{}'::jsonb),
        last_seen_at = now(),
        status = 'open',
        resolved_at = NULL
    WHERE company_id = p_company_id
      AND id = v_id;
  ELSE
    INSERT INTO public.operational_alerts (
      company_id, kind, dedupe_key, severity,
      subject_type, subject_id, payload, status
    )
    VALUES (
      p_company_id, p_kind, p_dedupe_key, p_severity,
      p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb), 'open'
    )
    RETURNING id INTO v_id;
    v_opened := true;
  END IF;

  IF v_opened OR v_reopened THEN
    INSERT INTO public.audit_events (
      company_id, doc_id, doc_type, from_state, to_state, "by", reason
    )
    VALUES (
      p_company_id,
      v_id,
      'operational_alert',
      CASE WHEN v_reopened THEN 'resolved' ELSE NULL END,
      'open',
      NULL,
      p_kind
    );
    IF p_roles IS NOT NULL AND cardinality(p_roles) > 0 THEN
      PERFORM public.fanout_operational_alert(p_company_id, v_id, VARIADIC p_roles);
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_missing_operational_alerts(
  p_company_id text,
  p_kind text,
  p_present_keys text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id text;
  v_resolved integer := 0;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.operational_alerts
    WHERE company_id = p_company_id
      AND kind = p_kind
      AND status = 'open'
      AND NOT (dedupe_key = ANY (coalesce(p_present_keys, ARRAY[]::text[])))
    FOR UPDATE
  LOOP
    UPDATE public.operational_alerts
    SET status = 'resolved',
        resolved_at = now()
    WHERE company_id = p_company_id
      AND id = v_id;
    INSERT INTO public.audit_events (
      company_id, doc_id, doc_type, from_state, to_state, "by", reason
    )
    VALUES (p_company_id, v_id, 'operational_alert', 'open', 'resolved', NULL, p_kind);
    v_resolved := v_resolved + 1;
  END LOOP;
  RETURN v_resolved;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Job implementations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ingest_company_fx_rates(
  p_company_id text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pub date;
  v_stale boolean := false;
  v_kwd jsonb;
  v_base text;
  v_quote text;
  v_rate numeric(18,8);
  v_kwd_base numeric;
  v_kwd_quote numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_required text[] := ARRAY['KWD', 'USD', 'SAR', 'AED'];
  v_code text;
BEGIN
  IF coalesce(p_payload ->> 'fetchFailed', 'false') = 'true' THEN
    PERFORM public.upsert_operational_alert(
      p_company_id, 'fx_stale', 'fx_stale:provider',
      'high', NULL, NULL,
      jsonb_build_object('summary', 'fx provider fetch failed'),
      ARRAY['accountant', 'admin']::text[]
    );
    PERFORM public.raise_schedule_error('FX_PROVIDER', 'fx provider fetch failed');
  END IF;

  v_pub := (p_payload ->> 'publicationDate')::date;
  IF v_pub IS NULL THEN
    PERFORM public.raise_schedule_error('VALIDATION', 'publicationDate required');
  END IF;
  v_kwd := p_payload -> 'kwdPer';
  IF v_kwd IS NULL OR jsonb_typeof(v_kwd) <> 'object' THEN
    PERFORM public.raise_schedule_error('VALIDATION', 'kwdPer object required');
  END IF;

  FOREACH v_code IN ARRAY v_required
  LOOP
    IF v_code = 'KWD' THEN
      CONTINUE;
    END IF;
    IF coalesce((v_kwd ->> v_code)::numeric, 0) <= 0 THEN
      PERFORM public.raise_schedule_error('VALIDATION', 'missing or invalid rate ' || v_code);
    END IF;
  END LOOP;

  v_stale := v_pub < public.kuwait_business_date() - 3;
  IF v_stale THEN
    PERFORM public.upsert_operational_alert(
      p_company_id, 'fx_stale', 'fx_stale:' || v_pub::text,
      'medium', NULL, NULL,
      jsonb_build_object(
        'summary', 'fx publication older than three days',
        'publicationDate', v_pub
      ),
      ARRAY['accountant', 'admin']::text[]
    );
  ELSE
    PERFORM public.resolve_missing_operational_alerts(
      p_company_id, 'fx_stale', ARRAY[]::text[]
    );
  END IF;

  SELECT base_currency INTO v_base
  FROM public.companies
  WHERE id = p_company_id;

  v_kwd_base := CASE
    WHEN v_base = 'KWD' THEN 1
    ELSE (v_kwd ->> v_base)::numeric
  END;
  IF v_kwd_base IS NULL OR v_kwd_base <= 0 THEN
    PERFORM public.raise_schedule_error('VALIDATION', 'no provider rate for company base');
  END IF;

  FOR v_quote IN
    SELECT c.code
    FROM public.currencies AS c
    WHERE c.company_id = p_company_id
      AND c.active
      AND c.code <> v_base
  LOOP
    v_kwd_quote := CASE
      WHEN v_quote = 'KWD' THEN 1
      ELSE (v_kwd ->> v_quote)::numeric
    END;
    IF v_kwd_quote IS NULL OR v_kwd_quote <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_rate := round(v_kwd_base / v_kwd_quote, 8);
    IF v_rate <= 0 OR v_rate <> v_rate THEN
      PERFORM public.raise_schedule_error('VALIDATION', 'non-finite fx rate');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.fx_rates
      WHERE company_id = p_company_id
        AND base_currency = v_base
        AND quote_currency = v_quote
        AND rate_date > v_pub
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.fx_rates (
      company_id, base_currency, quote_currency, rate, rate_date, source
    )
    VALUES (
      p_company_id, v_base, v_quote, v_rate, v_pub, 'cbk_allratestoday'
    )
    ON CONFLICT (company_id, base_currency, quote_currency, rate_date)
    DO UPDATE SET
      rate = EXCLUDED.rate,
      source = EXCLUDED.source
    WHERE public.fx_rates.rate IS DISTINCT FROM EXCLUDED.rate
       OR public.fx_rates.source IS DISTINCT FROM EXCLUDED.source;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'publicationDate', v_pub,
    'stale', v_stale,
    'pairsWritten', v_inserted,
    'skipped', v_skipped,
    'source', 'cbk_allratestoday'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_company_aging(
  p_company_id text,
  p_as_of date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_as_of date := coalesce(p_as_of, public.kuwait_business_date());
  v_customer record;
  v_exposure numeric(18,3);
  v_status text;
  v_overdue boolean;
  v_updated integer := 0;
  v_ar jsonb;
  v_ap jsonb;
BEGIN
  FOR v_customer IN
    SELECT id, credit_limit, exposure, payment_status, active
    FROM public.customers
    WHERE company_id = p_company_id
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(total - paid), 0)
    INTO v_exposure
    FROM public.customer_invoices
    WHERE company_id = p_company_id
      AND customer_id = v_customer.id
      AND state = 'posted'
      AND total > paid;

    SELECT EXISTS (
      SELECT 1
      FROM public.customer_invoices
      WHERE company_id = p_company_id
        AND customer_id = v_customer.id
        AND state = 'posted'
        AND total > paid
        AND (v_as_of - due_date) > 14
    ) INTO v_overdue;

    v_status := CASE
      WHEN v_exposure > v_customer.credit_limit THEN 'on_hold'
      WHEN v_overdue THEN 'overdue_14'
      ELSE 'current'
    END;

    IF v_customer.exposure IS DISTINCT FROM v_exposure
       OR v_customer.payment_status IS DISTINCT FROM v_status THEN
      UPDATE public.customers
      SET exposure = v_exposure,
          payment_status = v_status
      WHERE company_id = p_company_id
        AND id = v_customer.id;
      INSERT INTO public.audit_events (
        company_id, doc_id, doc_type, from_state, to_state, "by", reason
      )
      VALUES (
        p_company_id, v_customer.id, 'customer',
        v_customer.payment_status, v_status, NULL, 'aging_refresh'
      );
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'current', coalesce(sum(CASE WHEN v_as_of <= due_date THEN total - paid ELSE 0 END), 0),
    'days_1_30', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 1 AND 30 THEN total - paid ELSE 0 END), 0),
    'days_31_60', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 31 AND 60 THEN total - paid ELSE 0 END), 0),
    'days_61_90', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 61 AND 90 THEN total - paid ELSE 0 END), 0),
    'days_over_90', coalesce(sum(CASE WHEN v_as_of - due_date > 90 THEN total - paid ELSE 0 END), 0),
    'outstanding', coalesce(sum(total - paid), 0)
  )
  INTO v_ar
  FROM public.customer_invoices
  WHERE company_id = p_company_id
    AND state = 'posted'
    AND total > paid;

  SELECT jsonb_build_object(
    'current', coalesce(sum(CASE WHEN v_as_of <= due_date THEN total - paid ELSE 0 END), 0),
    'days_1_30', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 1 AND 30 THEN total - paid ELSE 0 END), 0),
    'days_31_60', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 31 AND 60 THEN total - paid ELSE 0 END), 0),
    'days_61_90', coalesce(sum(CASE WHEN v_as_of - due_date BETWEEN 61 AND 90 THEN total - paid ELSE 0 END), 0),
    'days_over_90', coalesce(sum(CASE WHEN v_as_of - due_date > 90 THEN total - paid ELSE 0 END), 0),
    'outstanding', coalesce(sum(total - paid), 0)
  )
  INTO v_ap
  FROM public.vendor_bills
  WHERE company_id = p_company_id
    AND state = 'posted'
    AND total > paid;

  RETURN jsonb_build_object(
    'asOf', v_as_of,
    'customersUpdated', v_updated,
    'ar', v_ar,
    'ap', v_ap
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_company_stale_drafts(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz := public.kuwait_business_ts() - interval '14 days';
  v_doc record;
  v_keys text[] := ARRAY[]::text[];
  v_opened integer := 0;
  v_roles text[];
BEGIN
  FOR v_doc IN
    SELECT * FROM (
      SELECT 'purchase_requisition'::text AS doc_type, id, updated_at
      FROM public.purchase_requisitions
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'rfq', id, updated_at FROM public.rfqs
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'purchase_order', id, updated_at FROM public.purchase_orders
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'goods_receipt', id, updated_at FROM public.goods_receipts
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'vendor_bill', id, updated_at FROM public.vendor_bills
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'vendor_payment', id, updated_at FROM public.vendor_payments
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'vendor_return', id, updated_at FROM public.vendor_returns
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'debit_note', id, updated_at FROM public.debit_notes
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'quote', id, updated_at FROM public.quotes
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'sales_order', id, updated_at FROM public.sales_orders
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'delivery_note', id, updated_at FROM public.delivery_notes
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'customer_invoice', id, updated_at FROM public.customer_invoices
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'customer_receipt', id, updated_at FROM public.customer_receipts
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'customer_return', id, updated_at FROM public.customer_returns
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'credit_note', id, updated_at FROM public.credit_notes
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'journal_entry', id, updated_at FROM public.journal_entries
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'internal_transfer', id, updated_at FROM public.internal_transfers
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
      UNION ALL
      SELECT 'stock_adjustment', id, updated_at FROM public.stock_adjustments
      WHERE company_id = p_company_id AND state = 'draft' AND updated_at < v_cutoff
    ) AS docs
  LOOP
    v_roles := CASE
      WHEN v_doc.doc_type IN (
        'purchase_requisition', 'rfq', 'purchase_order', 'goods_receipt',
        'vendor_bill', 'vendor_payment', 'vendor_return', 'debit_note'
      ) THEN ARRAY['ap_clerk', 'buyer', 'admin']::text[]
      WHEN v_doc.doc_type IN (
        'quote', 'sales_order', 'delivery_note', 'customer_invoice',
        'customer_receipt', 'customer_return', 'credit_note'
      ) THEN ARRAY['ar_clerk', 'sales_rep', 'admin']::text[]
      WHEN v_doc.doc_type = 'journal_entry' THEN ARRAY['accountant', 'admin']::text[]
      ELSE ARRAY['warehouse', 'admin']::text[]
    END;
    PERFORM public.upsert_operational_alert(
      p_company_id,
      'stale_draft',
      'stale_draft:' || v_doc.doc_type || ':' || v_doc.id,
      'medium',
      v_doc.doc_type,
      v_doc.id,
      jsonb_build_object('summary', 'draft unchanged for 14 days', 'updatedAt', v_doc.updated_at),
      v_roles
    );
    v_keys := array_append(v_keys, 'stale_draft:' || v_doc.doc_type || ':' || v_doc.id);
    v_opened := v_opened + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_opened,
    'resolved', public.resolve_missing_operational_alerts(p_company_id, 'stale_draft', v_keys)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._apply_period_close_task_scan(
  p_company_id text,
  p_run_id text,
  p_code text,
  p_status text,
  p_detail jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_task public.period_close_tasks%ROWTYPE;
  v_status text := p_status;
BEGIN
  SELECT * INTO v_task
  FROM public.period_close_tasks
  WHERE company_id = p_company_id
    AND period_close_run_id = p_run_id
    AND code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_task.status IN ('completed', 'skipped') THEN
    RETURN;
  END IF;
  IF p_code = 'final_review' AND v_status = 'completed' THEN
    v_status := 'pending';
  END IF;

  UPDATE public.period_close_tasks
  SET status = v_status,
      detail = coalesce(p_detail, '{}'::jsonb)
  WHERE company_id = p_company_id
    AND id = v_task.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_company_month_end(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date := public.kuwait_business_date();
  v_period public.fiscal_periods%ROWTYPE;
  v_run_id text;
  v_ids text[];
  v_count integer;
  v_runs integer := 0;
  v_blocked boolean;
BEGIN
  FOR v_period IN
    SELECT *
    FROM public.fiscal_periods
    WHERE company_id = p_company_id
      AND v_today BETWEEN ("end" - 5) AND ("end" + 7)
  LOOP
    v_run_id := public.ensure_period_close_run(p_company_id, v_period.id, NULL);
    PERFORM public.ensure_period_close_tasks(v_run_id);
    v_runs := v_runs + 1;

    SELECT coalesce(array_agg(id), ARRAY[]::text[]), count(*)
    INTO v_ids, v_count
    FROM (
      SELECT bsl.id
      FROM public.bank_statement_lines AS bsl
      JOIN public.bank_statements AS bs
        ON bs.company_id = bsl.company_id AND bs.id = bsl.bank_statement_id
      WHERE bsl.company_id = p_company_id
        AND bsl.status = 'unmatched'
        AND bsl.date BETWEEN v_period."start" AND v_period."end"
      LIMIT 20
    ) AS x;
    SELECT count(*) INTO v_count
    FROM public.bank_statement_lines AS bsl
    JOIN public.bank_statements AS bs
      ON bs.company_id = bsl.company_id AND bs.id = bsl.bank_statement_id
    WHERE bsl.company_id = p_company_id
      AND bsl.status = 'unmatched'
      AND bsl.date BETWEEN v_period."start" AND v_period."end";
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'reconcile_bank',
      CASE WHEN v_count > 0 THEN 'blocked' ELSE 'pending' END,
      jsonb_build_object('count', v_count, 'ids', coalesce(v_ids, ARRAY[]::text[]))
    );

    SELECT coalesce(array_agg(id), ARRAY[]::text[])
    INTO v_ids
    FROM (
      SELECT id FROM public.operational_alerts
      WHERE company_id = p_company_id AND kind = 'stale_draft' AND status = 'open'
      LIMIT 20
    ) AS x;
    SELECT count(*) INTO v_count
    FROM public.operational_alerts
    WHERE company_id = p_company_id AND kind = 'stale_draft' AND status = 'open';
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'review_stale_drafts',
      CASE WHEN v_count > 0 THEN 'blocked' ELSE 'pending' END,
      jsonb_build_object('count', v_count, 'ids', coalesce(v_ids, ARRAY[]::text[]))
    );

    SELECT coalesce(array_agg(id), ARRAY[]::text[])
    INTO v_ids
    FROM (
      SELECT gr.id
      FROM public.goods_receipts AS gr
      WHERE gr.company_id = p_company_id
        AND gr.state = 'posted'
        AND gr.date BETWEEN v_period."start" AND v_period."end"
        AND NOT EXISTS (
          SELECT 1 FROM public.vendor_bills AS vb
          WHERE vb.company_id = p_company_id
            AND vb.grn_id = gr.id
            AND vb.state IN ('posted', 'draft')
        )
      LIMIT 20
    ) AS x;
    SELECT count(*) INTO v_count
    FROM public.goods_receipts AS gr
    WHERE gr.company_id = p_company_id
      AND gr.state = 'posted'
      AND gr.date BETWEEN v_period."start" AND v_period."end"
      AND NOT EXISTS (
        SELECT 1 FROM public.vendor_bills AS vb
        WHERE vb.company_id = p_company_id
          AND vb.grn_id = gr.id
          AND vb.state IN ('posted', 'draft')
      );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'unbilled_deliveries',
      CASE WHEN v_count > 0 THEN 'blocked' ELSE 'pending' END,
      jsonb_build_object('count', v_count, 'ids', coalesce(v_ids, ARRAY[]::text[]))
    );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'missing_vendor_bills',
      CASE WHEN v_count > 0 THEN 'blocked' ELSE 'pending' END,
      jsonb_build_object('count', v_count, 'ids', coalesce(v_ids, ARRAY[]::text[]))
    );

    SELECT coalesce(array_agg(id), ARRAY[]::text[])
    INTO v_ids
    FROM (
      SELECT dn.id
      FROM public.delivery_notes AS dn
      WHERE dn.company_id = p_company_id
        AND dn.state = 'posted'
        AND dn.date BETWEEN v_period."start" AND v_period."end"
        AND NOT EXISTS (
          SELECT 1 FROM public.customer_invoices AS ci
          WHERE ci.company_id = p_company_id
            AND ci.dn_id = dn.id
            AND ci.state IN ('posted', 'draft')
        )
      LIMIT 20
    ) AS x;
    SELECT count(*) INTO v_count
    FROM public.delivery_notes AS dn
    WHERE dn.company_id = p_company_id
      AND dn.state = 'posted'
      AND dn.date BETWEEN v_period."start" AND v_period."end"
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_invoices AS ci
        WHERE ci.company_id = p_company_id
          AND ci.dn_id = dn.id
          AND ci.state IN ('posted', 'draft')
      );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'uninvoiced_revenue',
      CASE WHEN v_count > 0 THEN 'blocked' ELSE 'pending' END,
      jsonb_build_object('count', v_count, 'ids', coalesce(v_ids, ARRAY[]::text[]))
    );

    SELECT count(*) INTO v_count
    FROM public.fixed_assets AS fa
    WHERE fa.company_id = p_company_id
      AND fa.in_service_date <= v_period."end"
      AND (fa.cost - fa.residual_value - fa.accumulated_depreciation) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.asset_depreciation_entries AS ade
        WHERE ade.company_id = p_company_id
          AND ade.fixed_asset_id = fa.id
          AND ade.fiscal_period_id = v_period.id
      );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'depreciation_entries',
      CASE
        WHEN v_count > 0 THEN 'blocked'
        ELSE 'completed'
      END,
      jsonb_build_object('missing', v_count)
    );

    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'tax_validation', 'pending',
      jsonb_build_object('note', 'human tax review required')
    );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'review_adjustments', 'pending',
      jsonb_build_object('note', 'human adjustment review required')
    );
    PERFORM public._apply_period_close_task_scan(
      p_company_id, v_run_id, 'final_review', 'pending',
      jsonb_build_object('note', 'final review is never auto-completed')
    );

    SELECT EXISTS (
      SELECT 1 FROM public.period_close_tasks
      WHERE company_id = p_company_id
        AND period_close_run_id = v_run_id
        AND status = 'blocked'
    ) INTO v_blocked;

    UPDATE public.period_close_runs
    SET status = CASE
      WHEN status IN ('completed', 'cancelled') THEN status
      WHEN v_blocked THEN 'blocked'
      ELSE 'in_progress'
    END
    WHERE company_id = p_company_id
      AND id = v_run_id
      AND status NOT IN ('completed', 'cancelled');
  END LOOP;

  RETURN jsonb_build_object('periodsScanned', v_runs);
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_company_inventory_alerts(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date := public.kuwait_business_date();
  v_product record;
  v_on_hand numeric;
  v_short numeric;
  v_keys text[] := ARRAY[]::text[];
  v_opened integer := 0;
  v_severity text;
  v_abc text;
  v_total numeric := 0;
  v_cum numeric := 0;
  v_need_abc boolean;
BEGIN
  SELECT coalesce(
    NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE company_id = p_company_id AND abc_updated_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.products
      WHERE company_id = p_company_id
        AND (abc_updated_at IS NULL OR abc_updated_at < now() - interval '8 days')
    )
    OR extract(dow FROM v_today) = 0,
    true
  ) INTO v_need_abc;

  IF v_need_abc THEN
    SELECT coalesce(sum(sm.qty * sm.cost_per_unit), 0)
    INTO v_total
    FROM public.stock_moves AS sm
    WHERE sm.company_id = p_company_id
      AND sm.direction = 'out'
      AND sm.date >= v_today - 365;

    IF v_total <= 0 THEN
      UPDATE public.products
      SET abc_class = 'C',
          abc_updated_at = now()
      WHERE company_id = p_company_id
        AND (abc_class IS DISTINCT FROM 'C' OR abc_updated_at IS NULL);
    ELSE
      v_cum := 0;
      FOR v_product IN
        SELECT p.id,
               coalesce((
                 SELECT sum(sm.qty * sm.cost_per_unit)
                 FROM public.stock_moves AS sm
                 WHERE sm.company_id = p_company_id
                   AND sm.product_id = p.id
                   AND sm.direction = 'out'
                   AND sm.date >= v_today - 365
               ), 0) AS consumption_value
        FROM public.products AS p
        WHERE p.company_id = p_company_id
        ORDER BY 2 DESC, p.id
      LOOP
        IF v_product.consumption_value <= 0 OR v_total <= 0 THEN
          v_abc := 'C';
        ELSIF v_cum / v_total < 0.80 THEN
          v_abc := 'A';
        ELSIF v_cum / v_total < 0.95 THEN
          v_abc := 'B';
        ELSE
          v_abc := 'C';
        END IF;
        v_cum := v_cum + v_product.consumption_value;
        UPDATE public.products
        SET abc_class = v_abc,
            abc_updated_at = now()
        WHERE company_id = p_company_id
          AND id = v_product.id;
      END LOOP;
    END IF;
  END IF;

  FOR v_product IN
    SELECT id, reorder_point, abc_class
    FROM public.products
    WHERE company_id = p_company_id
      AND reorder_point > 0
  LOOP
    SELECT coalesce(sum(CASE WHEN direction = 'in' THEN qty ELSE -qty END), 0)
    INTO v_on_hand
    FROM public.stock_moves
    WHERE company_id = p_company_id
      AND product_id = v_product.id;

    v_short := greatest(v_product.reorder_point - v_on_hand, 0);
    IF v_short <= 0 THEN
      CONTINUE;
    END IF;

    v_abc := coalesce(v_product.abc_class, 'C');
    v_severity := CASE v_abc
      WHEN 'A' THEN 'critical'
      WHEN 'B' THEN 'high'
      ELSE 'medium'
    END;
    IF v_product.reorder_point > 0
       AND v_short > (v_product.reorder_point * 0.5) THEN
      v_severity := CASE v_severity
        WHEN 'medium' THEN 'high'
        WHEN 'high' THEN 'critical'
        ELSE v_severity
      END;
    END IF;

    PERFORM public.upsert_operational_alert(
      p_company_id,
      'reorder',
      'reorder:' || v_product.id,
      v_severity,
      'product',
      v_product.id,
      jsonb_build_object(
        'summary', 'on-hand below reorder point',
        'onHand', v_on_hand,
        'reorderPoint', v_product.reorder_point,
        'shortBy', v_short
      ),
      ARRAY['warehouse', 'buyer', 'admin']::text[]
    );
    v_keys := array_append(v_keys, 'reorder:' || v_product.id);
    v_opened := v_opened + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reorderOpened', v_opened,
    'reorderResolved', public.resolve_missing_operational_alerts(
      p_company_id, 'reorder', v_keys
    ),
    'abcRecomputed', v_need_abc
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_company_depreciation(
  p_company_id text,
  p_run_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prev_month_end date := (date_trunc('month', public.kuwait_business_date()::timestamp) - interval '1 day')::date;
  v_asset public.fixed_assets%ROWTYPE;
  v_period public.fiscal_periods%ROWTYPE;
  v_entry_id text;
  v_journal_id text;
  v_monthly numeric(18,3);
  v_remaining numeric(18,3);
  v_posted numeric(18,3);
  v_currency text;
  v_posted_count integer := 0;
  v_skipped integer := 0;
  v_blocked integer := 0;
BEGIN
  SELECT base_currency INTO v_currency
  FROM public.companies
  WHERE id = p_company_id;

  FOR v_asset IN
    SELECT *
    FROM public.fixed_assets
    WHERE company_id = p_company_id
      AND in_service_date <= v_prev_month_end
      AND (cost - residual_value - accumulated_depreciation) > 0
    FOR UPDATE
  LOOP
    v_monthly := round((v_asset.cost - v_asset.residual_value) / v_asset.useful_life_months, 3);
    IF v_monthly <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    FOR v_period IN
      SELECT *
      FROM public.fiscal_periods
      WHERE company_id = p_company_id
        AND "end" >= date_trunc('month', v_asset.in_service_date::timestamp)::date
        AND "end" <= v_prev_month_end
      ORDER BY year, month
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.asset_depreciation_entries
        WHERE company_id = p_company_id
          AND fixed_asset_id = v_asset.id
          AND fiscal_period_id = v_period.id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      BEGIN
        PERFORM public.assert_period_open_for_service(
          p_company_id, v_period."end", false
        );
      EXCEPTION WHEN OTHERS THEN
        PERFORM public.upsert_operational_alert(
          p_company_id,
          'depreciation_blocked',
          'depreciation_blocked:' || v_asset.id || ':' || v_period.id,
          'high',
          'fixed_asset',
          v_asset.id,
          jsonb_build_object(
            'summary', 'depreciation skipped because period is not open',
            'fiscalPeriodId', v_period.id
          ),
          ARRAY['accountant', 'admin']::text[]
        );
        v_blocked := v_blocked + 1;
        CONTINUE;
      END;

      SELECT cost - residual_value - accumulated_depreciation
      INTO v_remaining
      FROM public.fixed_assets
      WHERE company_id = p_company_id AND id = v_asset.id;

      v_posted := least(v_monthly, v_remaining);
      IF v_posted <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.asset_depreciation_entries (
        company_id, fixed_asset_id, fiscal_period_id,
        amount, posting_date, run_id
      )
      VALUES (
        p_company_id, v_asset.id, v_period.id,
        v_posted, v_period."end", p_run_id
      )
      RETURNING id INTO v_entry_id;

      v_journal_id := public.create_posting_journal(
        p_company_id,
        'asset_depreciation',
        v_entry_id,
        v_period."end",
        v_currency,
        'Depreciation ' || v_asset.code || ' ' || v_period.year || '-' || v_period.month
      );
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id,
        v_asset.depreciation_expense_account_id,
        'Depreciation expense',
        v_posted, 0
      );
      PERFORM public.add_journal_line(
        p_company_id, v_journal_id,
        v_asset.accumulated_depreciation_account_id,
        'Accumulated depreciation',
        0, v_posted
      );
      PERFORM public.assert_journal_balanced(v_journal_id);

      UPDATE public.asset_depreciation_entries
      SET journal_entry_id = v_journal_id
      WHERE company_id = p_company_id AND id = v_entry_id;

      UPDATE public.fixed_assets
      SET accumulated_depreciation = accumulated_depreciation + v_posted
      WHERE company_id = p_company_id AND id = v_asset.id;

      SELECT * INTO v_asset
      FROM public.fixed_assets
      WHERE company_id = p_company_id AND id = v_asset.id;

      v_posted_count := v_posted_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'posted', v_posted_count,
    'skipped', v_skipped,
    'blocked', v_blocked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_scheduled_company_job(
  p_company_id text,
  p_job_name text,
  p_run_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lease jsonb;
  v_metrics jsonb := '{}'::jsonb;
  v_run_id text;
BEGIN
  v_lease := public.begin_scheduled_job(p_company_id, p_job_name, p_run_key);
  IF v_lease ->> 'status' = 'skipped' THEN
    RETURN v_lease;
  END IF;
  v_run_id := v_lease ->> 'runId';

  BEGIN
    v_metrics := CASE p_job_name
      WHEN 'fx_ingest' THEN public.ingest_company_fx_rates(p_company_id, coalesce(p_payload, '{}'::jsonb))
      WHEN 'aging_refresh' THEN public.refresh_company_aging(p_company_id, NULL)
      WHEN 'stale_drafts' THEN public.scan_company_stale_drafts(p_company_id)
      WHEN 'month_end' THEN public.scan_company_month_end(p_company_id)
      WHEN 'inventory_alerts' THEN public.scan_company_inventory_alerts(p_company_id)
      WHEN 'depreciation' THEN public.post_company_depreciation(p_company_id, v_run_id)
      ELSE NULL
    END;
    IF v_metrics IS NULL THEN
      PERFORM public.raise_schedule_error('VALIDATION', 'unknown job');
    END IF;
    PERFORM public.finish_scheduled_job(
      p_company_id, v_run_id, 'succeeded', v_metrics, NULL, NULL
    );
    RETURN jsonb_build_object(
      'status', 'succeeded',
      'runId', v_run_id,
      'metrics', v_metrics
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      p_company_id, v_run_id, 'failed', v_metrics, SQLSTATE, SQLERRM
    );
    PERFORM public.upsert_operational_alert(
      p_company_id,
      'schedule_failure',
      'schedule_failure:' || p_job_name || ':' || p_run_key,
      'high',
      NULL,
      NULL,
      jsonb_build_object('summary', left(SQLERRM, 200), 'job', p_job_name),
      ARRAY['admin', 'accountant']::text[]
    );
    RETURN jsonb_build_object(
      'status', 'failed',
      'runId', v_run_id,
      'errorCode', SQLSTATE,
      'errorMessage', left(SQLERRM, 200)
    );
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants — service RPCs are project_admin only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.kuwait_business_ts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kuwait_business_date() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.raise_schedule_error(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_period_open_for_service(text, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_scheduled_job(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_scheduled_job(text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fanout_operational_alert(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_operational_alert(text, text, text, text, text, text, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_missing_operational_alerts(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_company_fx_rates(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_company_aging(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scan_company_stale_drafts(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_period_close_task_scan(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scan_company_month_end(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scan_company_inventory_alerts(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_company_depreciation(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_scheduled_company_job(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kuwait_business_ts() TO project_admin;
GRANT EXECUTE ON FUNCTION public.kuwait_business_date() TO project_admin;
GRANT EXECUTE ON FUNCTION public.assert_period_open_for_service(text, date, boolean) TO project_admin;
GRANT EXECUTE ON FUNCTION public.begin_scheduled_job(text, text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.finish_scheduled_job(text, text, text, jsonb, text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.fanout_operational_alert(text, text, text[]) TO project_admin;
GRANT EXECUTE ON FUNCTION public.upsert_operational_alert(text, text, text, text, text, text, jsonb, text[]) TO project_admin;
GRANT EXECUTE ON FUNCTION public.resolve_missing_operational_alerts(text, text, text[]) TO project_admin;
GRANT EXECUTE ON FUNCTION public.ingest_company_fx_rates(text, jsonb) TO project_admin;
GRANT EXECUTE ON FUNCTION public.refresh_company_aging(text, date) TO project_admin;
GRANT EXECUTE ON FUNCTION public.scan_company_stale_drafts(text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.scan_company_month_end(text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.scan_company_inventory_alerts(text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.post_company_depreciation(text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.run_scheduled_company_job(text, text, text, jsonb) TO project_admin;
