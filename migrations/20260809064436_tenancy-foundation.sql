-- Atmata ERP: company is the tenant boundary. Every later business table uses
-- the same `company_id = my_company_id()` RLS predicate through
-- `apply_company_access`, rather than bespoke per-module membership joins.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.companies (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  tax_profile text NOT NULL CHECK (tax_profile IN ('KW', 'SA', 'AE')),
  base_currency text NOT NULL CHECK (base_currency IN ('KWD', 'SAR', 'AED', 'USD')),
  vat_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT ARRAY['viewer']::text[]
    CHECK (
      cardinality(roles) > 0
      AND roles <@ ARRAY[
        'admin', 'approver', 'ap_clerk', 'ar_clerk', 'warehouse', 'buyer',
        'sales_rep', 'accountant', 'period_adjust', 'audit_unlock', 'viewer',
        'ai_agent'
      ]::text[]
    ),
  is_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (company_id, user_id)
);

CREATE INDEX company_members_company_id_idx ON public.company_members(company_id);
CREATE INDEX company_members_active_company_idx
  ON public.company_members(company_id, active) WHERE active;

CREATE TABLE public.invitations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY['viewer']::text[]
    CHECK (
      cardinality(roles) > 0
      AND roles <@ ARRAY[
        'admin', 'approver', 'ap_clerk', 'ar_clerk', 'warehouse', 'buyer',
        'sales_rep', 'accountant', 'period_adjust', 'audit_unlock', 'viewer',
        'ai_agent'
      ]::text[]
    ),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX invitations_company_status_idx
  ON public.invitations(company_id, status, expires_at);
CREATE UNIQUE INDEX invitations_one_pending_email_idx
  ON public.invitations(company_id, lower(email))
  WHERE status = 'pending';

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER company_members_set_updated_at
BEFORE UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cm.company_id
  FROM public.company_members AS cm
  WHERE cm.user_id = auth.uid()
    AND cm.active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.company_members AS cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.my_company_id()
        AND cm.active
        AND cm.roles && p_roles
    );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.has_company_role('admin');
$$;

CREATE OR REPLACE FUNCTION public.is_user_in_my_company(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.company_members AS cm
      WHERE cm.user_id = p_user_id
        AND cm.company_id = public.my_company_id()
        AND cm.active
    );
$$;

-- Runs before RLS WITH CHECK. Client callers never choose another company and
-- cannot mutate the company key after creation. Project-admin migrations and
-- trusted functions may supply a company explicitly.
CREATE OR REPLACE FUNCTION public.guard_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable';
  END IF;

  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.company_id IS NULL THEN
    NEW.company_id := v_company_id;
  END IF;

  IF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'cross-company write denied';
  END IF;

  RETURN NEW;
END;
$$;

-- Applies exactly one safe RLS design to every company-owned model. Later
-- migrations only call this helper, keeping tenant isolation identical across
-- all modules and child-line models.
CREATE OR REPLACE FUNCTION public.apply_company_access(p_table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table_name);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
    p_table_name
  );
  EXECUTE format(
    'DROP POLICY IF EXISTS company_isolation ON public.%I',
    p_table_name
  );
  EXECUTE format(
    'CREATE POLICY company_isolation ON public.%I FOR ALL TO authenticated '
    || 'USING (company_id = (SELECT public.my_company_id()) '
    || 'OR (SELECT public.is_platform_admin())) '
    || 'WITH CHECK (company_id = (SELECT public.my_company_id()) '
    || 'OR (SELECT public.is_platform_admin()))',
    p_table_name
  );
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON public.%I',
    p_table_name || '_guard_company_id',
    p_table_name
  );
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I '
    || 'FOR EACH ROW EXECUTE FUNCTION public.guard_company_id()',
    p_table_name || '_guard_company_id',
    p_table_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)',
    p_table_name || '_company_id_idx',
    p_table_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_role_array(p_roles text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF cardinality(p_roles) = 0
    OR NOT (p_roles <@ ARRAY[
      'admin', 'approver', 'ap_clerk', 'ar_clerk', 'warehouse', 'buyer',
      'sales_rep', 'accountant', 'period_adjust', 'audit_unlock', 'viewer',
      'ai_agent'
    ]::text[]) THEN
    RAISE EXCEPTION 'invalid role set';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_company(
  p_name text,
  p_base_currency text,
  p_tax_profile text,
  p_owner_id uuid,
  p_owner_email text,
  p_owner_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  INSERT INTO public.companies (name, base_currency, tax_profile)
  VALUES (trim(p_name), p_base_currency, p_tax_profile)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (p_owner_id, trim(p_owner_name), lower(trim(p_owner_email)))
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        active = true;

  INSERT INTO public.company_members (company_id, user_id, roles, is_owner)
  VALUES (v_company_id, p_owner_id, ARRAY['admin']::text[], true);

  RETURN v_company_id;
END;
$$;

-- One-time invitation token is created only inside the trusted function and
-- stored as a SHA-256 digest; only the raw return value is emailed.
CREATE OR REPLACE FUNCTION public.invite_user(
  p_email text,
  p_roles text[],
  p_expires_in interval DEFAULT interval '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_token text;
  v_invitation_id text;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  PERFORM public.assert_role_array(p_roles);
  v_company_id := public.my_company_id();
  v_token := encode(public.gen_random_bytes(32), 'hex');

  UPDATE public.invitations
  SET status = 'revoked'
  WHERE company_id = v_company_id
    AND lower(email) = lower(trim(p_email))
    AND status = 'pending';

  INSERT INTO public.invitations (
    company_id, email, roles, token_hash, invited_by, expires_at
  )
  VALUES (
    v_company_id,
    lower(trim(p_email)),
    p_roles,
    encode(public.digest(v_token, 'sha256'), 'hex'),
    auth.uid(),
    now() + p_expires_in
  )
  RETURNING id INTO v_invitation_id;

  RETURN jsonb_build_object(
    'id', v_invitation_id,
    'token', v_token,
    'email', lower(trim(p_email)),
    'expiresAt', now() + p_expires_in
  );
END;
$$;

-- Called by the server-only invitation action after it creates the auth user
-- through createInsForgeAdminClient(). Public callers never receive EXECUTE.
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token text,
  p_user_id uuid,
  p_full_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_invitation
  FROM public.invitations
  WHERE token_hash = encode(public.digest(p_token, 'sha256'), 'hex')
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired invitation';
  END IF;

  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (p_user_id, trim(p_full_name), v_invitation.email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        active = true;

  INSERT INTO public.company_members (company_id, user_id, roles)
  VALUES (v_invitation.company_id, p_user_id, v_invitation.roles)
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user already belongs to another company';
  END IF;

  UPDATE public.invitations
  SET status = 'accepted',
      accepted_by = p_user_id,
      accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN v_invitation.company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_roles(
  p_user_id uuid,
  p_roles text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_last_owner boolean;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  PERFORM public.assert_role_array(p_roles);
  v_company_id := public.my_company_id();
  SELECT cm.is_owner
  INTO v_is_last_owner
  FROM public.company_members AS cm
  WHERE cm.company_id = v_company_id
    AND cm.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF v_is_last_owner AND NOT ('admin' = ANY (p_roles)) THEN
    IF (SELECT count(*) FROM public.company_members
        WHERE company_id = v_company_id AND is_owner AND active) = 1 THEN
      RAISE EXCEPTION 'cannot remove admin role from last owner';
    END IF;
  END IF;

  UPDATE public.company_members
  SET roles = p_roles
  WHERE company_id = v_company_id
    AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_owner boolean;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  v_company_id := public.my_company_id();
  SELECT cm.is_owner
  INTO v_is_owner
  FROM public.company_members AS cm
  WHERE cm.company_id = v_company_id
    AND cm.user_id = p_user_id
    AND cm.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active member not found';
  END IF;

  IF v_is_owner
    AND (SELECT count(*) FROM public.company_members
         WHERE company_id = v_company_id AND is_owner AND active) = 1 THEN
    RAISE EXCEPTION 'cannot deactivate last owner';
  END IF;

  UPDATE public.company_members
  SET active = false
  WHERE company_id = v_company_id
    AND user_id = p_user_id;
END;
$$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.company_members TO authenticated;
GRANT SELECT ON public.invitations TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.companies, public.user_profiles,
  public.company_members, public.invitations, public.platform_admins
  FROM authenticated;
GRANT UPDATE (name, tax_profile, base_currency, vat_number)
  ON public.companies TO authenticated;
GRANT UPDATE (full_name, locale, avatar_url)
  ON public.user_profiles TO authenticated;

CREATE POLICY company_read ON public.companies
FOR SELECT TO authenticated
USING (
  id = (SELECT public.my_company_id())
  OR (SELECT public.is_platform_admin())
);

CREATE POLICY company_admin_update ON public.companies
FOR UPDATE TO authenticated
USING (
  id = (SELECT public.my_company_id()) AND (SELECT public.is_company_admin())
)
WITH CHECK (
  id = (SELECT public.my_company_id()) AND (SELECT public.is_company_admin())
);

CREATE POLICY own_or_company_profile_read ON public.user_profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (SELECT public.is_user_in_my_company(id))
);

CREATE POLICY own_profile_update ON public.user_profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY company_member_read ON public.company_members
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.my_company_id())
  OR (SELECT public.is_platform_admin())
);

CREATE POLICY invitation_read ON public.invitations
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.my_company_id())
    AND (SELECT public.is_company_admin())
  OR (SELECT public.is_platform_admin())
);

CREATE POLICY platform_admin_self_read ON public.platform_admins
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.is_platform_admin())
);

REVOKE ALL ON FUNCTION public.apply_company_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_role_array(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_company_role(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_in_my_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_company(text, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_company(text, text, text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.has_company_role(text[]) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.is_company_admin() TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.is_user_in_my_company(uuid) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.invite_user(text, text[], interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_roles(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_company(text, text, text, uuid, text, text) TO project_admin;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text) TO project_admin;
