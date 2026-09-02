-- Wave 3: scoped DELETE on opportunities for ar_clerk/admin.
-- UPDATE was granted in 20260901180200; DELETE was intentionally omitted until UI needed it.

GRANT DELETE ON public.opportunities TO authenticated;

CREATE POLICY opportunities_delete ON public.opportunities
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('ar_clerk', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  );
