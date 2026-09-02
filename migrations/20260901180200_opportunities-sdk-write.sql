-- Wave 3: minimal pipeline CRUD — SDK INSERT/UPDATE for ar_clerk/admin on opportunities.
-- Direct DML was revoked in 20260815155000; restore scoped writes with role RLS
-- (same helper pattern as attachments split + has_company_role checks).

-- Auto-assign document number on INSERT (next_document_number is not granted to authenticated).
CREATE OR REPLACE FUNCTION public.opportunities_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.number IS NULL OR btrim(NEW.number) = '') THEN
    NEW.number := public.next_document_number(NEW.company_id, 'opportunity');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_set_number ON public.opportunities;
CREATE TRIGGER opportunities_set_number
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunities_assign_number();

-- Restore table privileges (DELETE stays revoked — minimal scope is create/update only).
GRANT INSERT, UPDATE ON public.opportunities TO authenticated;

-- Split company_isolation FOR ALL into tenant SELECT + role-scoped writes.
DROP POLICY IF EXISTS company_isolation ON public.opportunities;

CREATE POLICY opportunities_select ON public.opportunities
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY opportunities_insert ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('ar_clerk', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY opportunities_update ON public.opportunities
  FOR UPDATE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('ar_clerk', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('ar_clerk', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  );
