-- Wave 6: replace inventory_forecasts demo seed with demand computed from outbound stock moves.

-- Drop demo placeholder rows (Wave 5 stub seed).
DELETE FROM public.inventory_forecasts;

-- Allow company-level (warehouse_id NULL) and per-warehouse rows for the same product/horizon.
ALTER TABLE public.inventory_forecasts
  DROP CONSTRAINT inventory_forecasts_pkey;

ALTER TABLE public.inventory_forecasts
  ADD CONSTRAINT inventory_forecasts_company_product_horizon_wh_key
  UNIQUE NULLS NOT DISTINCT (company_id, product_id, horizon_days, warehouse_id);

CREATE OR REPLACE FUNCTION public.refresh_inventory_forecasts(
  p_company_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deleted integer;
  v_inserted integer;
  v_cutoff date := current_date - 90;
BEGIN
  DELETE FROM public.inventory_forecasts AS f
  WHERE p_company_id IS NULL OR f.company_id = p_company_id;
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
      AND (p_company_id IS NULL OR sm.company_id = p_company_id)
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
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_inventory_forecasts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_forecasts(text) TO project_admin;

-- Backfill computed forecasts for all companies.
SELECT public.refresh_inventory_forecasts(NULL);
