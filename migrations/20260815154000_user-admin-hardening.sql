-- Phase 5 company user administration.
-- Consumes identity contracts from 20260815150000. Does not redefine
-- invite_user / accept_invitation / token identity / is_owner copy.

-- Company-admin invite/edit already uses assert_human_role_array (no ai_agent).
-- set_member_roles is already idempotent; deactivate_member is already an
-- inactive no-op with a self-deactivation guard. This migration tightens
-- SELECT RLS and revokes leftover table DML so mutations stay RPC-only.

DROP POLICY IF EXISTS company_member_read ON public.company_members;
CREATE POLICY company_member_read ON public.company_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.is_company_admin())
  )
  OR (SELECT public.is_platform_admin())
);

DROP POLICY IF EXISTS invitation_read ON public.invitations;
CREATE POLICY invitation_read ON public.invitations
FOR SELECT TO authenticated
USING (
  (
    company_id = (SELECT public.my_company_id())
    AND (SELECT public.is_company_admin())
  )
  OR (SELECT public.is_platform_admin())
);

REVOKE INSERT, UPDATE, DELETE ON public.company_members
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invitations
  FROM anon, authenticated;

ALTER FUNCTION public.assert_human_role_array(text[])
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.invite_user(text, text[], uuid, text, interval)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.set_member_roles(uuid, text[])
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.deactivate_member(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.accept_invitation(text, uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_company_admin()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.my_company_id()
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.assert_human_role_array(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_user(text, text[], uuid, text, interval)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_member_roles(uuid, text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_member(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.invite_user(text, text[], uuid, text, interval)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.set_member_roles(uuid, text[])
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.deactivate_member(uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.accept_invitation(text, uuid, text)
  TO project_admin;
