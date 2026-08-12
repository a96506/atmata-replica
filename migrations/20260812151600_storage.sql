-- Atmata ERP: storage layer. Two private buckets (`documents`, `imports`)
-- are created out-of-band via the InsForge CLI — see header note below.
-- This migration creates the polymorphic `attachments` table, the
-- `document_processing_jobs` queue (OCR extraction itself ships in the
-- `functions` todo), and path-scoped RLS on `storage.objects` keyed by
-- `my_company_id()` so the company IS the tenant for files too.
--
-- Bucket setup (run once per environment, CLI — not SQL):
--   npx @insforge/cli storage create-bucket documents --private
--   npx @insforge/cli storage create-bucket imports --private

CREATE TABLE public.attachments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (char_length(trim(doc_type)) > 0),
  doc_id text,
  bucket text NOT NULL CHECK (bucket IN ('documents', 'imports')),
  key text NOT NULL CHECK (char_length(trim(key)) > 0),
  url text NOT NULL CHECK (char_length(trim(url)) > 0),
  mime text,
  size bigint CHECK (size IS NULL OR size >= 0),
  filename text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key),
  CHECK (left(key, char_length(company_id) + 1) = company_id || '/')
);

CREATE INDEX attachments_doc_idx
  ON public.attachments(company_id, doc_type, doc_id);
CREATE INDEX attachments_uploader_idx
  ON public.attachments(company_id, uploaded_by);

CREATE TABLE public.document_processing_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ocr_vendor_bill', 'csv_bank_statement')),
  source_attachment_id text REFERENCES public.attachments(id) ON DELETE SET NULL,
  source_url text,
  source_key text,
  file_name text NOT NULL CHECK (char_length(trim(file_name)) > 0),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'review_needed', 'failed')),
  extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  matched_doc_id text,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_processing_jobs_list_idx
  ON public.document_processing_jobs(company_id, kind, status, created_at DESC);
CREATE INDEX document_processing_jobs_kind_idx
  ON public.document_processing_jobs(company_id, kind);

-- Attachments: company access (RLS + guard + index) + updated_at + identity lock.
-- `guard_company_id` already blocks company_id changes; this trigger also
-- freezes bucket/key/url (the storage object identity) — rename = delete + insert.
CREATE OR REPLACE FUNCTION public.lock_attachment_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.bucket IS DISTINCT FROM OLD.bucket THEN
      RAISE EXCEPTION 'attachments.bucket is immutable';
    END IF;
    IF NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'attachments.key is immutable';
    END IF;
    IF NEW.url IS DISTINCT FROM OLD.url THEN
      RAISE EXCEPTION 'attachments.url is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['attachments', 'document_processing_jobs']
  LOOP
    PERFORM public.apply_company_access(v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  END LOOP;
END;
$$;

CREATE TRIGGER attachments_lock_identity
BEFORE UPDATE ON public.attachments
FOR EACH ROW EXECUTE FUNCTION public.lock_attachment_identity();

REVOKE ALL ON FUNCTION public.lock_attachment_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_attachment_identity() TO authenticated, project_admin;

-- Storage RLS: path-scoped, company-isolated. First path segment is always
-- the company id (see path convention in the storage plan). `my_company_id()`
-- is STABLE SECURITY DEFINER — wrapping in a subquery evaluates it once per
-- statement. We DROP the auto-installed owner-only defaults first so they
-- don't OR together and leak across companies.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_delete ON storage.objects;

CREATE POLICY storage_objects_company_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket IN ('documents', 'imports')
    AND (storage.foldername(key))[1] = (SELECT public.my_company_id())
  );

CREATE POLICY storage_objects_company_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket IN ('documents', 'imports')
    AND (storage.foldername(key))[1] = (SELECT public.my_company_id())
  );

CREATE POLICY storage_objects_company_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket IN ('documents', 'imports')
    AND (storage.foldername(key))[1] = (SELECT public.my_company_id())
  )
  WITH CHECK (
    bucket IN ('documents', 'imports')
    AND (storage.foldername(key))[1] = (SELECT public.my_company_id())
  );

CREATE POLICY storage_objects_company_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket IN ('documents', 'imports')
    AND (storage.foldername(key))[1] = (SELECT public.my_company_id())
  );

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
