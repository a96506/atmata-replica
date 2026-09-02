-- Wave 6: computed price_alerts (history trigger + refresh RPC; replaces demo seed).

CREATE TABLE public.price_list_item_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_item_id text NOT NULL,
  price_list_id text NOT NULL,
  product_id text NOT NULL,
  old_unit_price numeric(18,3) NOT NULL,
  new_unit_price numeric(18,3) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, price_list_item_id)
    REFERENCES public.price_list_items(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, price_list_id)
    REFERENCES public.price_lists(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE CASCADE
);

CREATE INDEX price_list_item_history_company_product_changed_idx
  ON public.price_list_item_history(company_id, product_id, changed_at DESC);

SELECT public.apply_company_access('price_list_item_history');

CREATE OR REPLACE FUNCTION public.log_price_list_item_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
    INSERT INTO public.price_list_item_history (
      company_id,
      price_list_item_id,
      price_list_id,
      product_id,
      old_unit_price,
      new_unit_price
    )
    VALUES (
      NEW.company_id,
      NEW.id,
      NEW.price_list_id,
      NEW.product_id,
      OLD.unit_price,
      NEW.unit_price
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER price_list_items_log_price_change
  BEFORE UPDATE OF unit_price ON public.price_list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_price_list_item_price_change();

CREATE OR REPLACE FUNCTION public.refresh_price_alerts(
  p_threshold_pct numeric DEFAULT 5,
  p_company_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := coalesce(p_company_id, public.my_company_id());
  v_inserted integer := 0;
  v_rows integer;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company required';
  END IF;

  DELETE FROM public.price_alerts WHERE company_id = v_company_id;

  -- Path A: list_price_change from price_list_item_history (last 90d).
  WITH recent_supplier AS (
    SELECT DISTINCT ON (pol.product_id)
      pol.product_id,
      po.supplier_id
    FROM public.purchase_order_lines AS pol
    INNER JOIN public.purchase_orders AS po
      ON po.company_id = pol.company_id
      AND po.id = pol.purchase_order_id
    WHERE pol.company_id = v_company_id
      AND po.state NOT IN ('cancelled', 'draft')
    ORDER BY pol.product_id, po.date DESC, po.id DESC, pol.id DESC
  ),
  list_changes AS (
    SELECT DISTINCT ON (h.product_id)
      h.product_id,
      p.sku,
      rs.supplier_id,
      h.old_unit_price,
      h.new_unit_price,
      CASE
        WHEN h.old_unit_price > 0 THEN
          abs((h.new_unit_price - h.old_unit_price) / h.old_unit_price * 100)
        ELSE 0
      END AS change_pct,
      h.changed_at
    FROM public.price_list_item_history AS h
    INNER JOIN public.products AS p
      ON p.company_id = h.company_id
      AND p.id = h.product_id
    INNER JOIN recent_supplier AS rs
      ON rs.product_id = h.product_id
    WHERE h.company_id = v_company_id
      AND h.changed_at >= now() - interval '90 days'
      AND h.old_unit_price > 0
      AND abs((h.new_unit_price - h.old_unit_price) / h.old_unit_price * 100) > p_threshold_pct
    ORDER BY h.product_id, h.changed_at DESC, h.id DESC
  )
  INSERT INTO public.price_alerts (
    company_id, product_id, sku, supplier_id, alert_type, message, change_pct, detected_at
  )
  SELECT
    v_company_id,
    lc.product_id,
    lc.sku,
    lc.supplier_id,
    'list_price_change',
    format(
      'List price changed %s%% (%s → %s)',
      round(lc.change_pct, 1),
      round(lc.old_unit_price, 3),
      round(lc.new_unit_price, 3)
    ),
    round(lc.change_pct, 2),
    lc.changed_at
  FROM list_changes AS lc
  ON CONFLICT (company_id, product_id, supplier_id, alert_type) DO UPDATE
  SET sku = EXCLUDED.sku,
      message = EXCLUDED.message,
      change_pct = EXCLUDED.change_pct,
      detected_at = EXCLUDED.detected_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_inserted := v_inserted + v_rows;

  -- Path B: bill_variance — latest posted bill vs list price (default list or min_qty=1).
  WITH default_list AS (
    SELECT pl.id AS price_list_id
    FROM public.price_lists AS pl
    INNER JOIN public.companies AS c
      ON c.id = pl.company_id
    WHERE pl.company_id = v_company_id
      AND pl.active = true
      AND pl.currency = c.base_currency
      AND (pl.starts_on IS NULL OR pl.starts_on <= current_date)
      AND (pl.ends_on IS NULL OR pl.ends_on >= current_date)
    ORDER BY (pl.name ILIKE 'default') DESC, pl.created_at ASC
    LIMIT 1
  ),
  list_prices AS (
    SELECT DISTINCT ON (pli.product_id)
      pli.product_id,
      pli.unit_price AS list_price
    FROM public.price_list_items AS pli
    INNER JOIN public.price_lists AS pl
      ON pl.company_id = pli.company_id
      AND pl.id = pli.price_list_id
    WHERE pli.company_id = v_company_id
      AND pl.active = true
      AND pli.min_qty = 1
      AND (
        pli.price_list_id = (SELECT dl.price_list_id FROM default_list AS dl)
        OR NOT EXISTS (SELECT 1 FROM default_list)
      )
    ORDER BY
      pli.product_id,
      CASE
        WHEN pli.price_list_id = (SELECT dl.price_list_id FROM default_list AS dl) THEN 0
        ELSE 1
      END,
      pli.unit_price
  ),
  latest_bill_lines AS (
    SELECT DISTINCT ON (vb.supplier_id, vbl.product_id)
      vb.supplier_id,
      vbl.product_id,
      vbl.unit_price AS bill_price,
      vb.date AS bill_date
    FROM public.vendor_bill_lines AS vbl
    INNER JOIN public.vendor_bills AS vb
      ON vb.company_id = vbl.company_id
      AND vb.id = vbl.vendor_bill_id
    WHERE vbl.company_id = v_company_id
      AND vb.state = 'posted'
    ORDER BY vb.supplier_id, vbl.product_id, vb.date DESC, vb.id DESC, vbl.id DESC
  ),
  bill_variances AS (
    SELECT
      lbl.supplier_id,
      lbl.product_id,
      p.sku,
      lbl.bill_price,
      lp.list_price,
      CASE
        WHEN lp.list_price > 0 THEN
          abs((lbl.bill_price - lp.list_price) / lp.list_price * 100)
        ELSE 0
      END AS change_pct,
      lbl.bill_date
    FROM latest_bill_lines AS lbl
    INNER JOIN public.products AS p
      ON p.company_id = v_company_id
      AND p.id = lbl.product_id
    INNER JOIN list_prices AS lp
      ON lp.product_id = lbl.product_id
    WHERE lp.list_price > 0
      AND abs((lbl.bill_price - lp.list_price) / lp.list_price * 100) > p_threshold_pct
  )
  INSERT INTO public.price_alerts (
    company_id, product_id, sku, supplier_id, alert_type, message, change_pct, detected_at
  )
  SELECT
    v_company_id,
    bv.product_id,
    bv.sku,
    bv.supplier_id,
    'bill_variance',
    format(
      'Bill price %s vs list %s (%s%% variance)',
      round(bv.bill_price, 3),
      round(bv.list_price, 3),
      round(bv.change_pct, 1)
    ),
    round(bv.change_pct, 2),
    bv.bill_date::timestamptz
  FROM bill_variances AS bv
  ON CONFLICT (company_id, product_id, supplier_id, alert_type) DO UPDATE
  SET sku = EXCLUDED.sku,
      message = EXCLUDED.message,
      change_pct = EXCLUDED.change_pct,
      detected_at = EXCLUDED.detected_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_inserted := v_inserted + v_rows;

  -- Path C: po_price_drift — latest PO line vs prior PO for same supplier+product.
  WITH ranked_po_lines AS (
    SELECT
      po.supplier_id,
      pol.product_id,
      pol.unit_price,
      po.date,
      row_number() OVER (
        PARTITION BY po.supplier_id, pol.product_id
        ORDER BY po.date DESC, po.id DESC, pol.id DESC
      ) AS rn
    FROM public.purchase_order_lines AS pol
    INNER JOIN public.purchase_orders AS po
      ON po.company_id = pol.company_id
      AND po.id = pol.purchase_order_id
    WHERE pol.company_id = v_company_id
      AND po.state NOT IN ('cancelled', 'draft')
  ),
  po_drifts AS (
    SELECT
      curr.supplier_id,
      curr.product_id,
      p.sku,
      prev.unit_price AS prior_price,
      curr.unit_price AS current_price,
      CASE
        WHEN prev.unit_price > 0 THEN
          abs((curr.unit_price - prev.unit_price) / prev.unit_price * 100)
        ELSE 0
      END AS change_pct,
      curr.date AS po_date
    FROM ranked_po_lines AS curr
    INNER JOIN ranked_po_lines AS prev
      ON prev.supplier_id = curr.supplier_id
      AND prev.product_id = curr.product_id
      AND prev.rn = curr.rn + 1
    INNER JOIN public.products AS p
      ON p.company_id = v_company_id
      AND p.id = curr.product_id
    WHERE curr.rn = 1
      AND prev.unit_price > 0
      AND abs((curr.unit_price - prev.unit_price) / prev.unit_price * 100) > p_threshold_pct
  )
  INSERT INTO public.price_alerts (
    company_id, product_id, sku, supplier_id, alert_type, message, change_pct, detected_at
  )
  SELECT
    v_company_id,
    pd.product_id,
    pd.sku,
    pd.supplier_id,
    'po_price_drift',
    format(
      'PO price drift %s%% (%s → %s)',
      round(pd.change_pct, 1),
      round(pd.prior_price, 3),
      round(pd.current_price, 3)
    ),
    round(pd.change_pct, 2),
    pd.po_date::timestamptz
  FROM po_drifts AS pd
  ON CONFLICT (company_id, product_id, supplier_id, alert_type) DO UPDATE
  SET sku = EXCLUDED.sku,
      message = EXCLUDED.message,
      change_pct = EXCLUDED.change_pct,
      detected_at = EXCLUDED.detected_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_inserted := v_inserted + v_rows;

  RETURN jsonb_build_object(
    'companyId', v_company_id,
    'thresholdPct', p_threshold_pct,
    'alertsWritten', v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_price_list_item_price_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_price_alerts(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_price_alerts(numeric, text) TO authenticated;

ALTER FUNCTION public.log_price_list_item_price_change() SET search_path = '';
ALTER FUNCTION public.refresh_price_alerts(numeric, text) SET search_path = '';

-- Remove Wave 5 demo seed; initial computed refresh per company.
DELETE FROM public.price_alerts;

DO $$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    PERFORM public.refresh_price_alerts(5, v_company.id);
  END LOOP;
END;
$$;
