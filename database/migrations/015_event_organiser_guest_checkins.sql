-- Event organiser guest check-in and attendance records.
BEGIN;

CREATE TABLE public.estate_event_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL,
  event_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  checked_in_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estate_event_checkins_guest_fk
    FOREIGN KEY (guest_id, estate_id, event_id)
    REFERENCES public.estate_event_guests(id, estate_id, event_id) ON DELETE CASCADE,
  CONSTRAINT estate_event_checkins_invitation_fk
    FOREIGN KEY (invitation_id, estate_id, event_id)
    REFERENCES public.estate_event_invitations(id, estate_id, event_id) ON DELETE CASCADE,
  CONSTRAINT estate_event_checkins_event_fk
    FOREIGN KEY (event_id, estate_id)
    REFERENCES public.estate_events(id, estate_id) ON DELETE CASCADE,
  CONSTRAINT estate_event_checkins_one_per_guest UNIQUE (event_id, guest_id)
);

CREATE INDEX estate_event_checkins_event_time
  ON public.estate_event_checkins (event_id, checked_in_at DESC);

ALTER TABLE public.estate_event_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY estate_event_checkins_select_organiser ON public.estate_event_checkins
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_event_checkins.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'event_organiser')
  );

CREATE POLICY estate_event_checkins_insert_organiser ON public.estate_event_checkins
  FOR INSERT TO authenticated WITH CHECK (
    checked_in_by = (SELECT auth.uid()) AND
    EXISTS (SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_event_checkins.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'event_organiser')
  );

COMMIT;
