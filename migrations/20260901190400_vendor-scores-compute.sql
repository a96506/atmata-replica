-- Wave 6: replace vendor_scores demo seed with computed delivery/quality metrics.

DELETE FROM public.vendor_scores;

CREATE OR REPLACE FUNCTION public.refresh_vendor_scores(
  p_company_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_cutoff date := (current_date - interval '12 months')::date;
  v_rows integer := 0;
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

  DELETE FROM public.vendor_scores
  WHERE company_id = v_company_id;

  INSERT INTO public.vendor_scores (
    company_id,
    supplier_id,
    score,
    on_time_pct,
    quality_pct,
    computed_at
  )
  WITH grn_stats AS (
    SELECT
      gr.supplier_id,
      count(*) AS total_grns,
      count(*) FILTER (WHERE gr.date <= po.expected_date) AS on_time_grns
    FROM public.goods_receipts AS gr
    INNER JOIN public.purchase_orders AS po
      ON po.company_id = gr.company_id
     AND po.id = gr.po_id
    WHERE gr.company_id = v_company_id
      AND gr.state = 'posted'
      AND gr.date >= v_cutoff
    GROUP BY gr.supplier_id
    HAVING count(*) > 0
  ),
  quality_stats AS (
    SELECT
      gr.supplier_id,
      coalesce(sum(grl.qty_received), 0) AS received_qty,
      coalesce(
        sum(vrl.qty) FILTER (WHERE vr.id IS NOT NULL),
        0
      ) AS return_qty
    FROM public.goods_receipts AS gr
    INNER JOIN public.goods_receipt_lines AS grl
      ON grl.company_id = gr.company_id
     AND grl.goods_receipt_id = gr.id
    LEFT JOIN public.vendor_return_lines AS vrl
      ON vrl.company_id = grl.company_id
     AND vrl.grn_line_id = grl.id
    LEFT JOIN public.vendor_returns AS vr
      ON vr.company_id = vrl.company_id
     AND vr.id = vrl.vendor_return_id
     AND vr.state = 'posted'
    WHERE gr.company_id = v_company_id
      AND gr.state = 'posted'
      AND gr.date >= v_cutoff
    GROUP BY gr.supplier_id
  ),
  metrics AS (
    SELECT
      gs.supplier_id,
      round(100.0 * gs.on_time_grns / gs.total_grns, 2) AS on_time_pct,
      CASE
        WHEN coalesce(qs.received_qty, 0) = 0 THEN 100
        ELSE round(
          100.0 * (1 - least(qs.return_qty / qs.received_qty, 1)),
          2
        )
      END AS quality_pct
    FROM grn_stats AS gs
    LEFT JOIN quality_stats AS qs
      ON qs.supplier_id = gs.supplier_id
  )
  SELECT
    v_company_id,
    m.supplier_id,
    round(0.6 * m.on_time_pct + 0.4 * m.quality_pct)::numeric,
    m.on_time_pct,
    m.quality_pct,
    now()
  FROM metrics AS m;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_vendor_scores(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_vendor_scores(text) TO authenticated;

DO $$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies ORDER BY id
  LOOP
    PERFORM public.refresh_vendor_scores(v_company.id);
  END LOOP;
END;
$$;
