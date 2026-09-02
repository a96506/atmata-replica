-- Chart of Accounts SDK CRUD — accountant/admin scoped writes, tenant SELECT for all members.
-- Split generic company_isolation FOR ALL so viewers keep read access; block DELETE when JEs reference the account.

GRANT INSERT, UPDATE, DELETE ON public.accounts TO authenticated;

DROP POLICY IF EXISTS company_isolation ON public.accounts;

CREATE POLICY accounts_select ON public.accounts
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.my_company_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY accounts_insert ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('accountant', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY accounts_update ON public.accounts
  FOR UPDATE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('accountant', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('accountant', 'admin'))
    )
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY accounts_delete ON public.accounts
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.has_company_role('accountant', 'admin'))
      AND NOT EXISTS (
        SELECT 1
        FROM public.journal_entry_lines AS jel
        WHERE jel.company_id = accounts.company_id
          AND jel.account_id = accounts.id
      )
    )
    OR (SELECT public.is_platform_admin())
  );
