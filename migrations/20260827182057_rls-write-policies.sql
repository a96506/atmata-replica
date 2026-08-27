-- Add INSERT/UPDATE/DELETE RLS policies for tables flagged "rls-select-only"
-- by the InsForge advisor. Existing SELECT policies are not touched.
--
-- Design note: on company_members, invitations, notifications,
-- platform_provisioning_operations and platform_admins the runtime role
-- `authenticated` has INSERT/UPDATE/DELETE revoked and writes are routed
-- through SECURITY DEFINER RPCs that run as project_admin (bypassing RLS).
-- The policies below are defensive: they scope direct writes correctly so
-- the advisor clears and so that writes remain tenant-safe if grants are
-- ever restored. They reuse the same helper functions and subquery form as
-- the existing SELECT policies (my_company_id(), is_company_admin(),
-- is_platform_admin(), auth.uid()).
--
-- doc_state_transitions is intentionally left read-only: it is a shared
-- legal-document state-machine reference table with no row-level ownership
-- columns (no company_id / user_id / actor_id), and migration
-- 20260820210445 explicitly revoked writes from authenticated. Any INSERT
-- policy with USING (true) would let any tenant mutate shared reference
-- data, and one scoped to is_platform_admin() would be dead because
-- project_admin bypasses RLS. Writes belong to project_admin migrations.

-- ===========================================================================
-- public.company_members
--   SELECT scope: user_id = auth.uid()
--                OR (company_id = my_company_id() AND is_company_admin())
--                OR is_platform_admin()
--   Added: INSERT, UPDATE, DELETE scoped to company admin of the row's
--          company or platform admin. Self-service writes by a member on
--          their own row are intentionally NOT allowed (members must not
--          self-join or change their own roles).
-- ===========================================================================
DROP POLICY IF EXISTS company_member_insert ON public.company_members;
CREATE POLICY company_member_insert
  ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS company_member_update ON public.company_members;
CREATE POLICY company_member_update
  ON public.company_members
  FOR UPDATE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS company_member_delete ON public.company_members;
CREATE POLICY company_member_delete
  ON public.company_members
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

-- ===========================================================================
-- public.invitations
--   SELECT scope: (company_id = my_company_id() AND is_company_admin())
--                OR is_platform_admin()
--   Added: INSERT, UPDATE, DELETE with the same scope. WITH CHECK on
--          INSERT/UPDATE keeps invitations inside the caller's company.
-- ===========================================================================
DROP POLICY IF EXISTS invitation_insert ON public.invitations;
CREATE POLICY invitation_insert
  ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS invitation_update ON public.invitations;
CREATE POLICY invitation_update
  ON public.invitations
  FOR UPDATE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS invitation_delete ON public.invitations;
CREATE POLICY invitation_delete
  ON public.invitations
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.my_company_id())
      AND (SELECT public.is_company_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

-- ===========================================================================
-- public.notifications
--   SELECT scope: (company_id = my_company_id()
--                  AND recipient_user_id = auth.uid())
--                OR is_platform_admin()
--   Added:
--     INSERT  -> platform admin OR any member of the row's company
--                (notifications are system-generated within a company by
--                SECURITY DEFINER RPCs; the policy keeps inserts inside
--                the caller's company boundary).
--     UPDATE  -> recipient (auth.uid()) or platform admin. WITH CHECK
--                same, preventing reassignment of recipient_user_id.
--     DELETE  -> recipient (auth.uid()) or platform admin (dismiss).
-- ===========================================================================
DROP POLICY IF EXISTS notification_insert ON public.notifications;
CREATE POLICY notification_insert
  ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR company_id = (SELECT public.my_company_id())
  );

DROP POLICY IF EXISTS notification_update ON public.notifications;
CREATE POLICY notification_update
  ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    recipient_user_id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS notification_delete ON public.notifications;
CREATE POLICY notification_delete
  ON public.notifications
  FOR DELETE TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
  );

-- ===========================================================================
-- public.platform_provisioning_operations
--   SELECT scope: is_platform_admin()
--   Added: INSERT, UPDATE, DELETE scoped to platform admin. The
--          guard_platform_provisioning_immutable trigger already makes the
--          table append-only (DELETE blocked; completed rows immutable);
--          these policies align direct-write access with the SELECT scope.
-- ===========================================================================
DROP POLICY IF EXISTS platform_provisioning_admin_insert
  ON public.platform_provisioning_operations;
CREATE POLICY platform_provisioning_admin_insert
  ON public.platform_provisioning_operations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS platform_provisioning_admin_update
  ON public.platform_provisioning_operations;
CREATE POLICY platform_provisioning_admin_update
  ON public.platform_provisioning_operations
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS platform_provisioning_admin_delete
  ON public.platform_provisioning_operations;
CREATE POLICY platform_provisioning_admin_delete
  ON public.platform_provisioning_operations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- ===========================================================================
-- public.platform_admins
--   SELECT scope: user_id = auth.uid() OR is_platform_admin()
--   Added: INSERT, UPDATE, DELETE scoped to existing platform admins only.
--          Self-service INSERT is intentionally NOT allowed (it would let
--          any authenticated user self-elevate to platform admin). The
--          guard_platform_admin_owner_separation trigger keeps company
--          owners from becoming platform admins.
-- ===========================================================================
DROP POLICY IF EXISTS platform_admin_insert ON public.platform_admins;
CREATE POLICY platform_admin_insert
  ON public.platform_admins
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS platform_admin_update ON public.platform_admins;
CREATE POLICY platform_admin_update
  ON public.platform_admins
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS platform_admin_delete ON public.platform_admins;
CREATE POLICY platform_admin_delete
  ON public.platform_admins
  FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- ===========================================================================
-- public.doc_state_transitions
--   Left read-only. It is a shared legal-document state-machine reference
--   table with no row-level ownership columns (no company_id / user_id /
--   actor_id). Migration 20260820210445 explicitly revoked
--   INSERT/UPDATE/DELETE from authenticated and made the table SELECT-only
--   with USING (true). Writes belong to project_admin migrations only;
--   no safe tenant-scoped write policy exists for this table.
-- ===========================================================================
