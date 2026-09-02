-- Batch on-hand by product for inventory overview (replaces N+1 item_stock_by_warehouse fan-out).

CREATE OR REPLACE FUNCTION public.company_on_hand_by_product()
RETURNS TABLE (
  product_id text,
  on_hand numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    coalesce(sum(
      CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END
    ), 0)::numeric AS on_hand
  FROM public.products AS p
  LEFT JOIN public.stock_moves AS sm
    ON sm.company_id = p.company_id
    AND sm.product_id = p.id
  WHERE p.company_id = v_company_id
  GROUP BY p.id
  ORDER BY p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.company_on_hand_by_product() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_on_hand_by_product() TO authenticated;

ALTER FUNCTION public.company_on_hand_by_product() SET search_path = '';
