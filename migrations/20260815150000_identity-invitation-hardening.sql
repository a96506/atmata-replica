-- Shared identity foundation.
-- This migration exclusively owns invitation idempotency, acceptance, and
-- owner invariants. Later platform-admin and user-admin migrations consume
-- these contracts and must not redefine them.

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

UPDATE public.invitations
SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_email_canonical_check
    CHECK (email = lower(btrim(email)) AND email <> '');

CREATE UNIQUE INDEX invitations_company_request_id_idx
  ON public.invitations(company_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_human_role_array(p_roles text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_roles IS NULL
    OR cardinality(p_roles) = 0
    OR NOT (p_roles <@ ARRAY[
      'admin', 'approver', 'ap_clerk', 'ar_clerk', 'warehouse', 'buyer',
      'sales_rep', 'accountant', 'period_adjust', 'audit_unlock', 'viewer'
    ]::text[]) THEN
    RAISE EXCEPTION 'invalid human role set';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invitation_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.roles IS DISTINCT FROM OLD.roles
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.is_owner IS DISTINCT FROM OLD.is_owner
    OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'invitation identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitations_guard_identity ON public.invitations;
CREATE TRIGGER invitations_guard_identity
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_identity();

CREATE OR REPLACE FUNCTION public.guard_company_member_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'company membership identity is immutable';
  END IF;

  IF NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
    RAISE EXCEPTION 'company owners cannot be promoted or demoted';
  END IF;

  IF OLD.is_owner
    AND OLD.active
    AND 'admin' = ANY (OLD.roles)
    AND (NOT NEW.active OR NOT ('admin' = ANY (NEW.roles))) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(OLD.company_id, 0)
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.company_members AS other_owner
      WHERE other_owner.company_id = OLD.company_id
        AND other_owner.user_id <> OLD.user_id
        AND other_owner.is_owner
        AND other_owner.active
        AND 'admin' = ANY (other_owner.roles)
    ) THEN
      RAISE EXCEPTION 'cannot remove the last active owner administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_members_guard_owner ON public.company_members;
CREATE TRIGGER company_members_guard_owner
BEFORE UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.guard_company_member_owner();

CREATE OR REPLACE FUNCTION public.guard_owner_platform_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.is_owner THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.user_id::text, 2)
    );

    IF EXISTS (
      SELECT 1
      FROM public.platform_admins AS pa
      WHERE pa.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'platform administrators cannot be company owners';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_members_guard_platform_separation
  ON public.company_members;
CREATE TRIGGER company_members_guard_platform_separation
BEFORE INSERT OR UPDATE OF user_id, is_owner ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.guard_owner_platform_separation();

CREATE OR REPLACE FUNCTION public.guard_platform_admin_owner_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text, 2)
  );

  IF EXISTS (
    SELECT 1
    FROM public.company_members AS cm
    WHERE cm.user_id = NEW.user_id
      AND cm.is_owner
  ) THEN
    RAISE EXCEPTION 'company owners cannot be platform administrators';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_admins_guard_owner_separation
  ON public.platform_admins;
CREATE TRIGGER platform_admins_guard_owner_separation
BEFORE INSERT OR UPDATE OF user_id ON public.platform_admins
FOR EACH ROW EXECUTE FUNCTION public.guard_platform_admin_owner_separation();

-- The old overload generated a random raw token inside PostgreSQL. The
-- application now derives the raw token deterministically from its request ID
-- and secret, and sends only its SHA-256 hash to this RPC.
REVOKE ALL ON FUNCTION public.invite_user(text, text[], interval)
  FROM PUBLIC, authenticated;
DROP FUNCTION public.invite_user(text, text[], interval);

CREATE OR REPLACE FUNCTION public.invite_user(
  p_email text,
  p_roles text[],
  p_request_id uuid,
  p_token_hash text,
  p_expires_in interval DEFAULT interval '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_email text;
  v_roles text[];
  v_token_hash text;
  v_existing public.invitations%ROWTYPE;
  v_invitation public.invitations%ROWTYPE;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request id is required';
  END IF;

  IF p_expires_in IS NULL OR p_expires_in <= interval '0 seconds' THEN
    RAISE EXCEPTION 'positive invitation expiry is required';
  END IF;

  v_email := lower(btrim(p_email));
  IF v_email IS NULL
    OR v_email = ''
    OR position('@' IN v_email) <= 1
    OR position('@' IN v_email) = char_length(v_email) THEN
    RAISE EXCEPTION 'invalid invitation email';
  END IF;

  PERFORM public.assert_human_role_array(p_roles);
  SELECT array_agg(role_name ORDER BY role_name)
  INTO v_roles
  FROM (
    SELECT DISTINCT unnest(p_roles) AS role_name
  ) AS normalized_roles;

  v_token_hash := lower(btrim(p_token_hash));
  IF v_token_hash IS NULL OR v_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid invitation token hash';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  -- Serialize invitation replacement and request-id retries per company.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.invitations
  WHERE company_id = v_company_id
    AND request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.email IS DISTINCT FROM v_email
      OR v_existing.roles IS DISTINCT FROM v_roles
      OR v_existing.token_hash IS DISTINCT FROM v_token_hash
      OR v_existing.is_owner
      OR v_existing.expires_at IS DISTINCT FROM
        v_existing.created_at + p_expires_in THEN
      RAISE EXCEPTION 'request id was already used with different invitation data';
    END IF;

    RETURN jsonb_build_object(
      'id', v_existing.id,
      'email', v_existing.email,
      'expiresAt', v_existing.expires_at,
      'requestId', v_existing.request_id,
      'isOwner', false
    );
  END IF;

  UPDATE public.invitations
  SET status = 'revoked'
  WHERE company_id = v_company_id
    AND email = v_email
    AND status = 'pending';

  INSERT INTO public.invitations (
    company_id,
    email,
    roles,
    token_hash,
    request_id,
    is_owner,
    invited_by,
    expires_at
  )
  VALUES (
    v_company_id,
    v_email,
    v_roles,
    v_token_hash,
    p_request_id,
    false,
    auth.uid(),
    now() + p_expires_in
  )
  RETURNING * INTO v_invitation;

  RETURN jsonb_build_object(
    'id', v_invitation.id,
    'email', v_invitation.email,
    'expiresAt', v_invitation.expires_at,
    'requestId', v_invitation.request_id,
    'isOwner', false
  );
END;
$$;

-- Server-only acceptance. The canonical email comes from auth.users, never
-- from query parameters, form fields, or user_profiles.
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token text,
  p_user_id uuid,
  p_full_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
  v_auth_email text;
  v_membership public.company_members%ROWTYPE;
  v_has_membership boolean;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invitation token and user are required';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'full name is required';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.invitations
  WHERE token_hash = encode(public.digest(p_token, 'sha256'), 'hex')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invitation';
  END IF;

  SELECT lower(btrim(u.email))
  INTO v_auth_email
  FROM auth.users AS u
  WHERE u.id = p_user_id;

  IF NOT FOUND OR v_auth_email IS NULL OR v_auth_email = '' THEN
    RAISE EXCEPTION 'auth user not found';
  END IF;

  IF v_auth_email IS DISTINCT FROM v_invitation.email THEN
    RAISE EXCEPTION 'auth email does not match invitation';
  END IF;

  -- Serialize every acceptance for one auth identity, including attempts
  -- against different companies.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 1)
  );

  SELECT *
  INTO v_membership
  FROM public.company_members
  WHERE user_id = p_user_id
  FOR UPDATE;
  v_has_membership := FOUND;

  IF v_invitation.status = 'accepted' THEN
    IF v_invitation.accepted_by = p_user_id
      AND v_has_membership
      AND v_membership.company_id = v_invitation.company_id
      AND v_membership.is_owner = v_invitation.is_owner THEN
      RETURN v_invitation.company_id;
    END IF;

    RAISE EXCEPTION 'invitation was already accepted by another user';
  END IF;

  IF v_invitation.status <> 'pending'
    OR v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid or expired invitation';
  END IF;

  IF v_has_membership THEN
    RAISE EXCEPTION 'user already belongs to a company';
  END IF;

  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (p_user_id, btrim(p_full_name), v_auth_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        active = true;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    roles,
    is_owner,
    active
  )
  VALUES (
    v_invitation.company_id,
    p_user_id,
    v_invitation.roles,
    v_invitation.is_owner,
    true
  );

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
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_member public.company_members%ROWTYPE;
  v_roles text[];
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  PERFORM public.assert_human_role_array(p_roles);
  SELECT array_agg(role_name ORDER BY role_name)
  INTO v_roles
  FROM (
    SELECT DISTINCT unnest(p_roles) AS role_name
  ) AS normalized_roles;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id, 0)
  );

  -- Lock every owner row before evaluating the last active owner/admin rule.
  PERFORM 1
  FROM public.company_members
  WHERE company_id = v_company_id
    AND is_owner
  FOR UPDATE;

  SELECT *
  INTO v_member
  FROM public.company_members
  WHERE company_id = v_company_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF v_member.is_owner
    AND v_member.active
    AND NOT ('admin' = ANY (v_roles))
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_members AS other_owner
      WHERE other_owner.company_id = v_company_id
        AND other_owner.user_id <> p_user_id
        AND other_owner.is_owner
        AND other_owner.active
        AND 'admin' = ANY (other_owner.roles)
    ) THEN
    RAISE EXCEPTION 'cannot remove admin role from last active owner';
  END IF;

  UPDATE public.company_members
  SET roles = v_roles
  WHERE id = v_member.id
    AND roles IS DISTINCT FROM v_roles;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_member public.company_members%ROWTYPE;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self-deactivation is not allowed';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id, 0)
  );

  PERFORM 1
  FROM public.company_members
  WHERE company_id = v_company_id
    AND is_owner
  FOR UPDATE;

  SELECT *
  INTO v_member
  FROM public.company_members
  WHERE company_id = v_company_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  IF NOT v_member.active THEN
    RETURN;
  END IF;

  IF v_member.is_owner
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_members AS other_owner
      WHERE other_owner.company_id = v_company_id
        AND other_owner.user_id <> p_user_id
        AND other_owner.is_owner
        AND other_owner.active
        AND 'admin' = ANY (other_owner.roles)
    ) THEN
    RAISE EXCEPTION 'cannot deactivate last active owner';
  END IF;

  UPDATE public.company_members
  SET active = false
  WHERE id = v_member.id;
END;
$$;

-- Pin every M1 SECURITY DEFINER function in the identity/helper chain. Later
-- migrations may replace these functions, but must retain the same setting.
ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_platform_admin()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.my_company_id()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.has_company_role(text[])
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_company_admin()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_user_in_my_company(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_company_id()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.apply_company_access(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.provision_company(text, text, text, uuid, text, text)
  SET search_path = pg_catalog, public, pg_temp;

REVOKE INSERT, UPDATE, DELETE ON public.invitations
  FROM anon, authenticated;
REVOKE UPDATE (is_owner) ON public.company_members
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.assert_human_role_array(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_invitation_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_company_member_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_owner_platform_separation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_platform_admin_owner_separation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_user(text, text[], uuid, text, interval)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_member_roles(uuid, text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_member(uuid)
  FROM PUBLIC, anon;

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
