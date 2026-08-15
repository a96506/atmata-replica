-- M11: attachments.kind + template_version, and DELETE policy gate.
--
-- Defense in depth: generated PDFs (kind='generated_pdf') must be RLS-protected
-- from user delete. App-level checks get bypassed by direct API calls; RLS is the
-- only enforcement that holds. Platform admins can still delete any attachment
-- (cross-company admin path).
--
-- No backfill needed: ADD COLUMN kind NOT NULL DEFAULT 'user_upload' populates
-- existing rows in the same statement.
--
-- The storage migration (M10) installed a single `company_isolation` FOR ALL
-- policy on attachments via apply_company_access(). FOR ALL cannot exclude
-- DELETE, so we drop it and recreate as four operation-scoped policies with the
-- same predicate, except DELETE adds `kind='user_upload'`.

ALTER TABLE public.attachments
  ADD COLUMN kind text NOT NULL DEFAULT 'user_upload'
    CHECK (kind IN ('user_upload', 'generated_pdf')),
  ADD COLUMN template_version text;

-- Generated PDFs must carry a template version (cache key + history).
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_generated_pdf_template_version
    CHECK (kind <> 'generated_pdf' OR template_version IS NOT NULL);

CREATE INDEX attachments_doc_kind_idx
  ON public.attachments(company_id, doc_type, doc_id, kind);

DROP POLICY IF EXISTS company_isolation ON public.attachments;

CREATE POLICY company_isolation_select ON public.attachments
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY company_isolation_insert ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY company_isolation_update ON public.attachments
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY company_isolation_delete ON public.attachments
  FOR DELETE TO authenticated
  USING (
    (company_id = (SELECT public.my_company_id())
     AND kind = 'user_upload')
    OR (SELECT public.is_platform_admin())
  );
