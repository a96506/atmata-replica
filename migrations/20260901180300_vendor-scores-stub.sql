-- Wave 4: vendor_scores stub for purchasing overview tab (read-only demo scores).

CREATE TABLE public.vendor_scores (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id text NOT NULL,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  on_time_pct numeric NOT NULL CHECK (on_time_pct >= 0 AND on_time_pct <= 100),
  quality_pct numeric NOT NULL CHECK (quality_pct >= 0 AND quality_pct <= 100),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, supplier_id),
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE CASCADE
);

CREATE INDEX vendor_scores_company_score_idx
  ON public.vendor_scores(company_id, score DESC);

SELECT public.apply_company_access('vendor_scores');

-- Demo placeholder scores for existing active suppliers.
INSERT INTO public.vendor_scores (company_id, supplier_id, score, on_time_pct, quality_pct, computed_at)
SELECT
  s.company_id,
  s.id,
  CASE s.id
    WHEN 'sup_1' THEN 86
    WHEN 'sup_2' THEN 79
    WHEN 'sup_3' THEN 72
    WHEN 'sup_4' THEN 68
    ELSE 70 + (abs(hashtext(s.id)) % 25)::numeric
  END,
  CASE s.id
    WHEN 'sup_1' THEN 92
    WHEN 'sup_2' THEN 88
    WHEN 'sup_3' THEN 81
    WHEN 'sup_4' THEN 77
    ELSE 75 + (abs(hashtext(s.id || ':on_time')) % 20)::numeric
  END,
  CASE s.id
    WHEN 'sup_1' THEN 94
    WHEN 'sup_2' THEN 90
    WHEN 'sup_3' THEN 85
    WHEN 'sup_4' THEN 82
    ELSE 80 + (abs(hashtext(s.id || ':quality')) % 15)::numeric
  END,
  now()
FROM public.suppliers AS s
WHERE s.active = true
ON CONFLICT (company_id, supplier_id) DO NOTHING;
