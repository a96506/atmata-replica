-- Wave 5: inventory_forecasts stub for inventory overview forecast tab (read-only demo projections).

CREATE TABLE public.inventory_forecasts (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  warehouse_id text,
  forecast_qty numeric NOT NULL CHECK (forecast_qty >= 0),
  horizon_days integer NOT NULL CHECK (horizon_days > 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id, horizon_days),
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE CASCADE
);

CREATE INDEX inventory_forecasts_company_horizon_idx
  ON public.inventory_forecasts(company_id, horizon_days);

SELECT public.apply_company_access('inventory_forecasts');

-- Demo placeholder demand projections (company-level; warehouse_id null).
INSERT INTO public.inventory_forecasts (company_id, product_id, warehouse_id, forecast_qty, horizon_days, computed_at)
SELECT
  p.company_id,
  p.id,
  NULL,
  CASE p.id
    WHEN 'prod_1' THEN 95
    WHEN 'prod_2' THEN 2100
    WHEN 'prod_3' THEN 44
    WHEN 'prod_4' THEN 6
    ELSE 10 + (abs(hashtext(p.id || ':30')) % 50)::numeric
  END,
  30,
  now()
FROM public.products AS p
WHERE p.sellable = true OR p.purchasable = true
ON CONFLICT (company_id, product_id, horizon_days) DO NOTHING;

INSERT INTO public.inventory_forecasts (company_id, product_id, warehouse_id, forecast_qty, horizon_days, computed_at)
SELECT
  p.company_id,
  p.id,
  NULL,
  CASE p.id
    WHEN 'prod_1' THEN 280
    WHEN 'prod_2' THEN 6200
    WHEN 'prod_3' THEN 128
    WHEN 'prod_4' THEN 14
    ELSE 30 + (abs(hashtext(p.id || ':90')) % 150)::numeric
  END,
  90,
  now()
FROM public.products AS p
WHERE p.sellable = true OR p.purchasable = true
ON CONFLICT (company_id, product_id, horizon_days) DO NOTHING;
