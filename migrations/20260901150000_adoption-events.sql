-- Wave 3: persist adoption usage metrics (minimal event log).
-- One row per adopted parent line → target doc type at picker continue time.

CREATE TABLE public.adoption_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_doc_type text NOT NULL,
  source_doc_id text NOT NULL,
  target_doc_type text NOT NULL,
  adopted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE INDEX adoption_events_company_adopted_idx
  ON public.adoption_events(company_id, adopted_at DESC);

CREATE INDEX adoption_events_company_target_idx
  ON public.adoption_events(company_id, target_doc_type, adopted_at DESC);

SELECT public.apply_company_access('adoption_events');
