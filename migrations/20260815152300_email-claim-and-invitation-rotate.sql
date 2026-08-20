-- Shared identity trigger referenced table-specific columns on NEW/OLD.
-- PostgreSQL resolves those against the firing table, so email_log updates
-- failed with: record "new" has no field "suggestion_id".
-- Invitation identity also blocked token_hash rotation required at send time.

CREATE OR REPLACE FUNCTION public.guard_functions_support_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable';
  END IF;

  IF TG_TABLE_NAME = 'email_log'
    AND v_new->>'idempotency_key' IS DISTINCT FROM v_old->>'idempotency_key' THEN
    RAISE EXCEPTION 'email_log.idempotency_key is immutable';
  END IF;

  IF TG_TABLE_NAME = 'ai_queued_actions'
    AND (
      v_new->>'suggestion_id' IS DISTINCT FROM v_old->>'suggestion_id'
      OR v_new->>'action_name' IS DISTINCT FROM v_old->>'action_name'
      OR v_new->'payload' IS DISTINCT FROM v_old->'payload'
    ) THEN
    RAISE EXCEPTION 'ai_queued_actions source identity is immutable';
  END IF;

  IF TG_TABLE_NAME = 'ai_thresholds'
    AND v_new->>'automation_type' IS DISTINCT FROM v_old->>'automation_type' THEN
    RAISE EXCEPTION 'ai_thresholds.automation_type is immutable';
  END IF;

  RETURN NEW;
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
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.is_owner IS DISTINCT FROM OLD.is_owner
    OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'invitation identity is immutable';
  END IF;

  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
    AND (OLD.status <> 'pending' OR NEW.status <> 'pending') THEN
    RAISE EXCEPTION 'invitation identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;
