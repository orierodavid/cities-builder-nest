-- Cover the two high-volume event attendance read paths:
-- paginated guest-name ordering and active invitation lookups/counts.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_event_guests_estate_event_name
  ON public.estate_event_guests (estate_id, event_id, guest_name, id);

CREATE INDEX IF NOT EXISTS idx_event_invitations_estate_event_active_guest
  ON public.estate_event_invitations (estate_id, event_id, guest_id)
  WHERE status = 'active';

COMMIT;
