-- Phase 2 shared runtime: Postgres jobs queue + schedules.
-- Claim uses FOR UPDATE SKIP LOCKED (SDK cannot express this).
-- Wake: AFTER INSERT trigger → realtime.publish('jobs', 'job_enqueued', …).
-- Pattern refs:
--   https://docs.insforge.dev/core-concepts/realtime/overview
--   https://www.prisma.io/blog/you-dont-need-a-job-queue-postgres-already-has-skip-locked
-- No CONCURRENTLY (InsForge migration constraint).

-- ---------------------------------------------------------------------------
-- 0. Platform carrier company for global (company_id NULL) schedule fan-out
--    jobs.company_id is NOT NULL; erp handlers expand to active tenants and
--    must skip this suspended sentinel.
-- ---------------------------------------------------------------------------

INSERT INTO public.companies (id, name, base_currency, tax_profile, status, plan)
VALUES ('__platform__', 'System (jobs carrier)', 'KWD', 'KW', 'suspended', 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. jobs table
-- ---------------------------------------------------------------------------

CREATE TABLE public.jobs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email', 'ocr', 'recon', 'erp', 'pdf')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts int NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE INDEX jobs_pending_run_after_idx
  ON public.jobs (run_after, created_at)
  WHERE status = 'pending';

CREATE INDEX jobs_company_id_idx ON public.jobs (company_id);

CREATE INDEX jobs_status_idx ON public.jobs (status, run_after);

DROP TRIGGER IF EXISTS jobs_set_updated_at ON public.jobs;
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS jobs_guard_company_id ON public.jobs;
CREATE TRIGGER jobs_guard_company_id
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_id();

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select ON public.jobs;
CREATE POLICY jobs_select ON public.jobs
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS jobs_insert ON public.jobs;
CREATE POLICY jobs_insert ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

REVOKE ALL ON TABLE public.jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.jobs TO authenticated;
-- Claim/complete mutate via SECURITY DEFINER RPCs (bypass RLS).
GRANT ALL ON TABLE public.jobs TO project_admin;

INSERT INTO public.company_table_manifest (table_name)
VALUES ('jobs')
ON CONFLICT (table_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. RPCs: enqueue / claim / complete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_company_id text DEFAULT NULL,
  p_run_after timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_id text;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('email', 'ocr', 'recon', 'erp', 'pdf') THEN
    RAISE EXCEPTION 'invalid job type';
  END IF;

  v_company_id := nullif(trim(coalesce(p_company_id, '')), '');
  IF v_company_id IS NULL THEN
    v_company_id := public.my_company_id();
  END IF;

  -- Service / admin global fan-out (no user company): carrier sentinel.
  IF v_company_id IS NULL AND auth.uid() IS NULL THEN
    v_company_id := '__platform__';
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'company not found';
  END IF;

  INSERT INTO public.jobs (company_id, type, payload, run_after, status)
  VALUES (
    v_company_id,
    p_type,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_run_after, now()),
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_job(p_worker_id text)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_worker text := nullif(trim(coalesce(p_worker_id, '')), '');
BEGIN
  IF v_worker IS NULL THEN
    RAISE EXCEPTION 'worker_id required';
  END IF;

  RETURN QUERY
  WITH next_job AS (
    SELECT j.id
    FROM public.jobs AS j
    WHERE j.status = 'pending'
      AND j.run_after <= now()
    ORDER BY j.run_after ASC, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.jobs AS j
  SET status = 'running',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = v_worker,
      last_error = NULL,
      updated_at = now()
  FROM next_job
  WHERE j.id = next_job.id
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id text,
  p_error text DEFAULT NULL
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_err text := nullif(trim(coalesce(p_error, '')), '');
BEGIN
  IF p_job_id IS NULL OR char_length(trim(p_job_id)) = 0 THEN
    RAISE EXCEPTION 'job_id required';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job not found';
  END IF;

  IF v_err IS NULL THEN
    UPDATE public.jobs
    SET status = 'done',
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = p_job_id
    RETURNING * INTO v_job;
    RETURN v_job;
  END IF;

  IF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.jobs
    SET status = 'failed',
        locked_at = NULL,
        locked_by = NULL,
        last_error = left(v_err, 2000),
        updated_at = now()
    WHERE id = p_job_id
    RETURNING * INTO v_job;
  ELSE
    -- Exponential backoff: 2^attempts seconds (Prisma SKIP LOCKED pattern).
    UPDATE public.jobs
    SET status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        last_error = left(v_err, 2000),
        run_after = now() + make_interval(secs => (power(2, v_job.attempts))::double precision),
        updated_at = now()
    WHERE id = p_job_id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_job(text, jsonb, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, jsonb, text, timestamptz)
  TO authenticated, project_admin;

REVOKE ALL ON FUNCTION public.claim_job(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job(text)
  TO project_admin;

REVOKE ALL ON FUNCTION public.complete_job(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_job(text, text)
  TO project_admin;

-- ---------------------------------------------------------------------------
-- 3. Realtime wake channel + AFTER INSERT trigger
-- ---------------------------------------------------------------------------

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('jobs', 'In-process job wake channel', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.notify_job_enqueued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, realtime, pg_temp
AS $$
BEGIN
  PERFORM realtime.publish(
    'jobs',
    'job_enqueued',
    jsonb_build_object(
      'id', NEW.id,
      'type', NEW.type,
      'company_id', NEW.company_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_notify_enqueued ON public.jobs;
CREATE TRIGGER jobs_notify_enqueued
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_job_enqueued();

REVOKE ALL ON FUNCTION public.notify_job_enqueued() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. schedules table + global ERP seed rows
-- ---------------------------------------------------------------------------

CREATE TABLE public.schedules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  job_type text NOT NULL CHECK (job_type IN ('email', 'ocr', 'recon', 'erp', 'pdf')),
  cron_expr text NOT NULL CHECK (char_length(trim(cron_expr)) > 0),
  timezone text NOT NULL DEFAULT 'UTC' CHECK (char_length(trim(timezone)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (company_id, name)
);

CREATE INDEX schedules_active_idx
  ON public.schedules (is_active, cron_expr)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS schedules_set_updated_at ON public.schedules;
CREATE TRIGGER schedules_set_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedules_select ON public.schedules;
CREATE POLICY schedules_select ON public.schedules
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

REVOKE ALL ON TABLE public.schedules FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.schedules TO authenticated;
-- Writes: service / project_admin only (RLS bypass + table grant).
GRANT ALL ON TABLE public.schedules TO project_admin;

-- Seed GLOBAL rows from ops/insforge/schedules.json / src/lib/schedules/manifest.ts
INSERT INTO public.schedules (
  id, company_id, name, job_type, cron_expr, timezone, payload, is_active
)
VALUES
  (
    'sched_erp_fx_daily',
    NULL,
    'erp-fx-daily',
    'erp',
    '15 21 * * *',
    'UTC',
    '{"job":"fx_ingest"}'::jsonb,
    true
  ),
  (
    'sched_erp_fx_daily_retry',
    NULL,
    'erp-fx-daily-retry',
    'erp',
    '45 21 * * *',
    'UTC',
    '{"job":"fx_ingest"}'::jsonb,
    true
  ),
  (
    'sched_erp_aging_daily',
    NULL,
    'erp-aging-daily',
    'erp',
    '0 22 * * *',
    'UTC',
    '{"job":"aging_refresh"}'::jsonb,
    true
  ),
  (
    'sched_erp_stale_drafts_daily',
    NULL,
    'erp-stale-drafts-daily',
    'erp',
    '20 22 * * *',
    'UTC',
    '{"job":"stale_drafts"}'::jsonb,
    true
  ),
  (
    'sched_erp_month_end_daily',
    NULL,
    'erp-month-end-daily',
    'erp',
    '0 23 * * *',
    'UTC',
    '{"job":"month_end"}'::jsonb,
    true
  ),
  (
    'sched_erp_depreciation_daily',
    NULL,
    'erp-depreciation-daily',
    'erp',
    '30 23 * * *',
    'UTC',
    '{"job":"depreciation"}'::jsonb,
    true
  ),
  (
    'sched_erp_inventory_alerts_daily',
    NULL,
    'erp-inventory-alerts-daily',
    'erp',
    '0 3 * * *',
    'UTC',
    '{"job":"inventory_alerts"}'::jsonb,
    true
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  job_type = EXCLUDED.job_type,
  cron_expr = EXCLUDED.cron_expr,
  timezone = EXCLUDED.timezone,
  payload = EXCLUDED.payload,
  is_active = EXCLUDED.is_active,
  updated_at = now();
