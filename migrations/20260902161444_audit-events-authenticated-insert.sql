-- F-062: Restore authenticated INSERT on audit_events for session writers
-- (writeAuditEvent / field_change / attachment events).
--
-- write-command-foundation revoked INSERT/UPDATE/DELETE so document RPCs own
-- ledger writes via SECURITY DEFINER. App-level audit writers still use the
-- SDK insert path and need INSERT privilege back. UPDATE/DELETE stay revoked
-- (append-only). Existing company_isolation FOR ALL already supplies WITH CHECK
-- (company_id = my_company_id() OR is_platform_admin()); guard_company_id fills
-- company_id before the check.
-- Pattern: GRANT + RLS (https://supabase.com/docs/guides/database/postgres/row-level-security).

GRANT INSERT ON public.audit_events TO authenticated;
