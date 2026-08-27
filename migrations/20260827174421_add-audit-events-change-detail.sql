-- F-062: Add change-detail + event-type columns to audit_events so auditors can
-- see what changed (old/new JSON) and so attachment add/remove events can be written.
-- from_state is already nullable; to_state is currently NOT NULL and must become
-- nullable because attachment events have no state transition.

ALTER TABLE public.audit_events
  ADD COLUMN event_type text NOT NULL DEFAULT 'state_transition'
    CHECK (event_type IN ('state_transition','attachment_added','attachment_removed','field_change')),
  ADD COLUMN change_detail jsonb,
  ALTER COLUMN to_state DROP NOT NULL;

-- Existing rows backfill to event_type='state_transition' via the DEFAULT.
