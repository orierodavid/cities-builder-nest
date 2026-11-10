BEGIN;
ALTER TABLE public.estate_event_guests ADD CONSTRAINT estate_event_guests_id_estate_event_unique UNIQUE (id,estate_id,event_id);
CREATE TABLE public.estate_event_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 estate_id uuid NOT NULL,
 event_id uuid NOT NULL,
 guest_id uuid NOT NULL,
 code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CONSTRAINT estate_event_invitations_guest_fk FOREIGN KEY (guest_id,estate_id,event_id) REFERENCES public.estate_event_guests(id,estate_id,event_id) ON DELETE CASCADE,
 CONSTRAINT estate_event_invitations_event_fk FOREIGN KEY (event_id,estate_id) REFERENCES public.estate_events(id,estate_id) ON DELETE CASCADE,
 CONSTRAINT estate_event_invitations_revoked_check CHECK ((status='revoked' AND revoked_at IS NOT NULL) OR (status='active' AND revoked_at IS NULL))
);
CREATE UNIQUE INDEX estate_event_invitations_one_active_per_guest ON public.estate_event_invitations (guest_id) WHERE status='active';
CREATE INDEX estate_event_invitations_event_created ON public.estate_event_invitations (event_id,created_at DESC);
ALTER TABLE public.estate_event_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY estate_event_invitations_select_organiser ON public.estate_event_invitations FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_invitations.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
CREATE POLICY estate_event_invitations_insert_organiser ON public.estate_event_invitations FOR INSERT TO authenticated WITH CHECK (
 created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_invitations.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
CREATE POLICY estate_event_invitations_update_organiser ON public.estate_event_invitations FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_invitations.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser'))
WITH CHECK (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_invitations.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser'));
COMMIT;