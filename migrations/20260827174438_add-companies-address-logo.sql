-- F-013: Company profile needs address + logo columns for the tenant company-edit form.

ALTER TABLE public.companies
  ADD COLUMN address text,
  ADD COLUMN logo_url text;
