-- Wave 6: align refresh_inventory_forecasts grants + company scoping with refresh_vendor_scores;
-- add metrics_refresh scheduled job (vendor_scores, price_alerts, inventory_forecasts).

CREATE OR REPLACE FUNCTION public.refresh_inventory_forecasts(
  p_company_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_deleted integer;
  v_inserted integer;
  v_cutoff date := current_date - 90;
BEGIN
  v_company_id := nullif(btrim(coalesce(p_company_id, '')), '');
  IF v_company_id IS NULL THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'company_id required when not authenticated';
    END IF;
    v_company_id := public.my_company_id();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (SELECT public.is_platform_admin())
     AND v_company_id IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'company access denied';
  END IF;

  DELETE FROM public.inventory_forecasts AS f
  WHERE f.company_id = v_company_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  WITH out_moves AS (
    SELECT
      sm.company_id,
      sm.product_id,
      sm.warehouse_id,
      sum(sm.qty) AS total_qty
    FROM public.stock_moves AS sm
    WHERE sm.direction = 'out'
      AND sm.date >= v_cutoff
      AND sm.company_id = v_company_id
    GROUP BY sm.company_id, sm.product_id, sm.warehouse_id
  ),
  company_agg AS (
    SELECT
      om.company_id,
      om.product_id,
      NULL::text AS warehouse_id,
      sum(om.total_qty) / 90.0 AS avg_daily_out
    FROM out_moves AS om
    GROUP BY om.company_id, om.product_id
  ),
  warehouse_agg AS (
    SELECT
      om.company_id,
      om.product_id,
      om.warehouse_id,
      om.total_qty / 90.0 AS avg_daily_out
    FROM out_moves AS om
  ),
  combined AS (
    SELECT * FROM company_agg
    UNION ALL
    SELECT * FROM warehouse_agg
  ),
  horizons AS (
    SELECT 30 AS horizon_days
    UNION ALL
    SELECT 90
  ),
  to_insert AS (
    SELECT
      c.company_id,
      c.product_id,
      c.warehouse_id,
      h.horizon_days,
      round(c.avg_daily_out * h.horizon_days, 2) AS forecast_qty
    FROM combined AS c
    CROSS JOIN horizons AS h
    WHERE c.avg_daily_out > 0
  )
  INSERT INTO public.inventory_forecasts (
    company_id, product_id, warehouse_id, forecast_qty, horizon_days, computed_at
  )
  SELECT
    ti.company_id,
    ti.product_id,
    ti.warehouse_id,
    ti.forecast_qty,
    ti.horizon_days,
    now()
  FROM to_insert AS ti;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'cutoff', v_cutoff,
    'companyId', v_company_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_inventory_forecasts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_forecasts(text) TO authenticated;

-- Idempotent re-grant (Wave 6 compute migrations already grant these; ensure present).
REVOKE ALL ON FUNCTION public.refresh_vendor_scores(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_vendor_scores(text) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_price_alerts(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_price_alerts(numeric, text) TO authenticated;

-- Service-mode fan-out: recompute all derived metrics for one company (scheduler path).
CREATE OR REPLACE FUNCTION public.refresh_company_metrics(
  p_company_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_vendor_rows integer;
  v_price jsonb;
  v_forecast jsonb;
BEGIN
  IF p_company_id IS NULL OR btrim(p_company_id) = '' THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  v_vendor_rows := public.refresh_vendor_scores(p_company_id);
  v_price := public.refresh_price_alerts(5, p_company_id);
  v_forecast := public.refresh_inventory_forecasts(p_company_id);

  RETURN jsonb_build_object(
    'vendorScores', v_vendor_rows,
    'priceAlerts', v_price,
    'inventoryForecasts', v_forecast
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_company_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_company_metrics(text) TO project_admin;

ALTER TABLE public.scheduled_job_runs
  DROP CONSTRAINT IF EXISTS scheduled_job_runs_job_name_check;

ALTER TABLE public.scheduled_job_runs
  ADD CONSTRAINT scheduled_job_runs_job_name_check CHECK (
    job_name IN (
      'fx_ingest', 'aging_refresh', 'stale_drafts',
      'month_end', 'inventory_alerts', 'depreciation', 'metrics_refresh'
    )
  );

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
      WHEN 'metrics_refresh' THEN public.refresh_company_metrics(p_company_id)
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

INSERT INTO public.schedules (
  id, company_id, name, job_type, cron_expr, timezone, payload, is_active
)
VALUES (
  'sched_erp_metrics_refresh_daily',
  NULL,
  'erp-metrics-refresh-daily',
  'erp',
  '0 2 * * *',
  'UTC',
  '{"job":"metrics_refresh"}'::jsonb,
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
