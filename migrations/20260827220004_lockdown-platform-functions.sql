-- Lockdown platform SECURITY DEFINER functions (advisor: dangerous-function).
--
-- All 9 functions below were callable by anon/PUBLIC (PUBLIC gets EXECUTE by
-- default on CREATE FUNCTION). anon access is the real privilege-escalation
-- risk because these RPCs run as the SECURITY DEFINER owner (project_admin)
-- and only require_platform_admin() guards them — anon could trigger the
-- guard's "UNAUTHENTICATED" path but the surface must not be reachable.
--
-- Caller analysis (grep src/ for each function name):
--   platform_list_companies          -> src/features/platform-admin/infrastructure/insforge-repository.ts:41 (cookie session = authenticated)
--   platform_company_row_counts      -> src/.../insforge-repository.ts:56 (authenticated)
--   company_table_allowlist_violations -> src/.../insforge-repository.ts:104 (authenticated)
--   platform_resend_owner_invitation -> src/.../insforge-repository.ts:76 (authenticated)
--   platform_get_company             -> src/.../insforge-repository.ts:50 (authenticated)
--   platform_provision_company       -> src/.../insforge-repository.ts:67 (authenticated)
--   platform_set_company_status      -> src/.../insforge-repository.ts:87 (authenticated)
--   platform_issue_invitation_token  -> NOT called from src/; only invoked internally by
--                                       platform_provision_company / platform_resend_owner_invitation
--                                       (both SECURITY DEFINER, run as project_admin) -> service-role only.
--   require_platform_admin            -> helper used by RLS policies + platform RPCs; keep authenticated
--                                       (RLS needs it), REVOKE anon + PUBLIC.
--
-- All function bodies schema-qualify public.* / auth.* references; built-ins
-- (now, encode, gen_random_bytes, coalesce, btrim, ...) resolve from pg_catalog,
-- which is always searched even with an empty search_path. Setting
-- search_path = '' is safe and is the strongest defense against search_path
-- hijacking (no unqualified name can resolve to a writable schema).

-- 1. platform_list_companies(text, text, integer, integer)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_list_companies(text, text, integer, integer)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_list_companies(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_list_companies(text, text, integer, integer) FROM anon;

-- 2. platform_company_row_counts(text)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_company_row_counts(text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_company_row_counts(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_company_row_counts(text) FROM anon;

-- 3. company_table_allowlist_violations()
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.company_table_allowlist_violations()
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.company_table_allowlist_violations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.company_table_allowlist_violations() FROM anon;

-- 4. platform_resend_owner_invitation(text)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_resend_owner_invitation(text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_resend_owner_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_resend_owner_invitation(text) FROM anon;

-- 5. platform_issue_invitation_token(text)
--    Caller: NOT in src/; only called internally by SECURITY DEFINER RPCs that
--    run as project_admin. Revoke anon + authenticated + PUBLIC, grant project_admin.
ALTER FUNCTION public.platform_issue_invitation_token(text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_issue_invitation_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_issue_invitation_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_issue_invitation_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_issue_invitation_token(text) TO project_admin;

-- 6. platform_get_company(text)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_get_company(text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_get_company(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_get_company(text) FROM anon;

-- 7. platform_provision_company(uuid, text, text, text)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_provision_company(uuid, text, text, text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_provision_company(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_provision_company(uuid, text, text, text) FROM anon;

-- 8. platform_set_company_status(text, text, integer, text)
--    Caller: authenticated (src). Keep authenticated, drop anon/PUBLIC.
ALTER FUNCTION public.platform_set_company_status(text, text, integer, text)
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_set_company_status(text, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_set_company_status(text, text, integer, text) FROM anon;

-- 9. require_platform_admin()
--    Helper used by RLS policies + platform RPCs. Keep authenticated (RLS
--    needs it), drop anon/PUBLIC. search_path locked.
ALTER FUNCTION public.require_platform_admin()
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.require_platform_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.require_platform_admin() FROM anon;
