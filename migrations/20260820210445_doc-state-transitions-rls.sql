-- Shared reference table: legal document state machine.
-- Grants already SELECT-only for authenticated; enable RLS so advisor
-- rls-disabled clears while remaining readable to every tenant member.

ALTER TABLE public.doc_state_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_state_transitions_select ON public.doc_state_transitions;
CREATE POLICY doc_state_transitions_select
  ON public.doc_state_transitions
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.doc_state_transitions FROM authenticated;
GRANT SELECT ON public.doc_state_transitions TO authenticated;
