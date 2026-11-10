BEGIN;
CREATE TABLE public.estate_event_guests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,
 guest_name text NOT NULL CHECK (char_length(trim(guest_name)) BETWEEN 2 AND 160),
 email text CHECK (email IS NULL OR (char_length(email) <= 254 AND position('@' IN email) > 1)),
 phone text CHECK (phone IS NULL OR char_length(phone) <= 32),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT estate_event_guests_event_estate_fk FOREIGN KEY (event_id,estate_id) REFERENCES public.estate_events(id,estate_id) ON DELETE CASCADE
);
CREATE INDEX idx_estate_event_guests_event_created ON public.estate_event_guests (event_id,created_at,id);
ALTER TABLE public.estate_event_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY estate_event_guests_select_organiser ON public.estate_event_guests FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_guests.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
CREATE POLICY estate_event_guests_insert_organiser ON public.estate_event_guests FOR INSERT TO authenticated WITH CHECK (
 created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_guests.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
CREATE POLICY estate_event_guests_update_organiser ON public.estate_event_guests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_guests.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser'))
WITH CHECK (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_guests.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser'));
CREATE POLICY estate_event_guests_delete_organiser ON public.estate_event_guests FOR DELETE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_event_guests.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
COMMIT;