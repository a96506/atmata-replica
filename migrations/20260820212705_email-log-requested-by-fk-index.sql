-- Follow-up: email_log_requested_by_idx already existed as a composite
-- (company_id, requested_by, created_at DESC), so the prior IF NOT EXISTS
-- no-op'd and left email_log_requested_by_fkey without a leading-column cover.
CREATE INDEX IF NOT EXISTS email_log_requested_by_fkey_idx
  ON public.email_log (requested_by);
