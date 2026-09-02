-- F-069(b) / F-041: pending → recall → draft for doc types that expose recall
-- in src/lib/state-machines (DEFAULT, RETURN_DOC, JOURNAL_ENTRY).
-- Mirrors shared pending approve/reject seed (*). Empty roles = any member
-- (matches TS Action.roles: []; cardinality>0 gate in resolve_doc_transition).
-- Does not alter JE approve/reject wiring from F-069(a).

INSERT INTO public.doc_state_transitions (doc_type, from_state, action, to_state, roles)
VALUES
  ('*', 'pending', 'recall', 'draft', ARRAY[]::text[])
ON CONFLICT (doc_type, from_state, action) DO NOTHING;
