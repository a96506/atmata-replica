-- Party contact emails + send-time invitation token rotation.
-- Stamp sits after AI persistence RPCs and before reserved platform-admin 153000.
-- Raw invitation tokens are never stored; only SHA-256 hashes remain.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.customers
SET email = CASE id
  WHEN 'cust_1' THEN 'quotes@kuwait-retail.example'
  WHEN 'cust_2' THEN 'accounts@gulf-foods.example'
  WHEN 'cust_3' THEN 'orders@city-pharmacy.example'
  WHEN 'cust_4' THEN 'procurement@project-alpha.example'
  ELSE lower(id) || '@parties.example'
END
WHERE email IS NULL OR btrim(email) = '';

UPDATE public.suppliers
SET email = CASE id
  WHEN 'sup_1' THEN 'rfq@petrochem-gulf.example'
  WHEN 'sup_2' THEN 'sales@packline-kw.example'
  WHEN 'sup_3' THEN 'quotes@printhub.example'
  WHEN 'sup_4' THEN 'sales@gulf-supplies.example'
  ELSE lower(id) || '@vendors.example'
END
WHERE email IS NULL OR btrim(email) = '';

ALTER TABLE public.customers
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT customers_email_format_chk
    CHECK (
      char_length(btrim(email)) >= 3
      AND position('@' IN email) > 1
      AND position('@' IN email) < char_length(email)
    );

ALTER TABLE public.suppliers
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT suppliers_email_format_chk
    CHECK (
      char_length(btrim(email)) >= 3
      AND position('@' IN email) > 1
      AND position('@' IN email) < char_length(email)
    );

CREATE UNIQUE INDEX IF NOT EXISTS customers_company_email_idx
  ON public.customers (company_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_email_idx
  ON public.suppliers (company_id, lower(email));

CREATE OR REPLACE FUNCTION public.rotate_invitation_token(p_invitation_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_user_id uuid;
  v_invitation public.invitations%ROWTYPE;
  v_raw text;
  v_hash text;
BEGIN
  v_user_id := auth.uid();
  v_company_id := public.my_company_id();

  IF v_user_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'company admin required';
  END IF;
  IF p_invitation_id IS NULL OR char_length(trim(p_invitation_id)) = 0 THEN
    RAISE EXCEPTION 'invitation id required';
  END IF;

  SELECT i.*
  INTO v_invitation
  FROM public.invitations AS i
  WHERE i.company_id = v_company_id
    AND i.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;
  IF v_invitation.status <> 'pending' OR v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation is not sendable';
  END IF;

  v_raw := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(public.digest(v_raw, 'sha256'), 'hex');

  UPDATE public.invitations
  SET token_hash = v_hash
  WHERE company_id = v_company_id
    AND id = p_invitation_id;

  RETURN v_raw;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_invitation_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_invitation_token(text) TO authenticated;
