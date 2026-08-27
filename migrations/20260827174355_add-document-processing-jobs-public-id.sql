-- F-042: Add tenant-safe public UUID column to document_processing_jobs.
-- The existing id (bigint IDENTITY) remains for internal FK use; the AP invoice
-- route will switch to public_id (a separate TS task).

ALTER TABLE public.document_processing_jobs
  ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT document_processing_jobs_public_id_not_null CHECK (public_id IS NOT NULL);

CREATE UNIQUE INDEX document_processing_jobs_company_public_id_uidx
  ON public.document_processing_jobs (company_id, public_id);

-- RLS: the existing company_isolation policy (ALL commands, scoped by company_id)
-- already covers public_id. No new policy needed.
