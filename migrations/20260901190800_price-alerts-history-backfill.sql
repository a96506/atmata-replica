-- Wave 6 follow-up: baseline price_list_item_history from current list prices
-- so future unit_price updates produce detectable old→new rows for refresh_price_alerts.

INSERT INTO public.price_list_item_history (
  company_id,
  price_list_item_id,
  price_list_id,
  product_id,
  old_unit_price,
  new_unit_price,
  changed_at
)
SELECT
  pli.company_id,
  pli.id,
  pli.price_list_id,
  pli.product_id,
  pli.unit_price,
  pli.unit_price,
  pli.updated_at
FROM public.price_list_items AS pli
WHERE NOT EXISTS (
  SELECT 1
  FROM public.price_list_item_history AS h
  WHERE h.company_id = pli.company_id
    AND h.price_list_item_id = pli.id
);

-- Recompute alerts (bill variance / PO drift unchanged; baseline rows have 0% list change).
DO $$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.companies LOOP
    PERFORM public.refresh_price_alerts(5, v_company.id);
  END LOOP;
END;
$$;
