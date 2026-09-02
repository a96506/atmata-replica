-- Wave 5: price_alerts stub for purchasing overview (read-only demo alerts).

CREATE TABLE public.price_alerts (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  sku text NOT NULL,
  supplier_id text NOT NULL,
  alert_type text NOT NULL,
  message text NOT NULL,
  change_pct numeric NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id, supplier_id, alert_type),
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE CASCADE
);

CREATE INDEX price_alerts_company_detected_idx
  ON public.price_alerts(company_id, detected_at DESC);

SELECT public.apply_company_access('price_alerts');

-- Demo placeholder alerts for purchasable products × active suppliers.
INSERT INTO public.price_alerts (
  company_id, product_id, sku, supplier_id, alert_type, message, change_pct, detected_at
)
SELECT
  p.company_id,
  p.id,
  p.sku,
  s.id,
  CASE
    WHEN p.id = 'prod_1' AND s.id = 'sup_1' THEN 'price_increase'
    WHEN p.id = 'prod_3' AND s.id = 'sup_3' THEN 'price_increase'
    ELSE 'price_watch'
  END,
  CASE
    WHEN p.id = 'prod_1' AND s.id = 'sup_1' THEN 'Above 90d moving average'
    WHEN p.id = 'prod_3' AND s.id = 'sup_3' THEN 'Within tolerance'
    WHEN p.id = 'prod_2' AND s.id = 'sup_2' THEN 'Quote drift vs last PO'
    ELSE 'Monitor list price vs last purchase'
  END,
  CASE
    WHEN p.id = 'prod_1' AND s.id = 'sup_1' THEN 8.2
    WHEN p.id = 'prod_3' AND s.id = 'sup_3' THEN 3.1
    WHEN p.id = 'prod_2' AND s.id = 'sup_2' THEN 5.4
    ELSE 2 + (abs(hashtext(p.id || ':' || s.id)) % 6)::numeric
  END,
  now() - ((abs(hashtext(p.id || s.id)) % 14) || ' days')::interval
FROM public.products AS p
CROSS JOIN public.suppliers AS s
WHERE p.company_id = s.company_id
  AND p.purchasable = true
  AND s.active = true
  AND (
    (p.id = 'prod_1' AND s.id = 'sup_1')
    OR (p.id = 'prod_3' AND s.id = 'sup_3')
    OR (p.id = 'prod_2' AND s.id = 'sup_2')
    OR (abs(hashtext(p.id || s.id)) % 7 = 0)
  )
ON CONFLICT (company_id, product_id, supplier_id, alert_type) DO NOTHING;
