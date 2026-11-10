-- Event organiser role and estate-scoped event details.
BEGIN;
ALTER TABLE public.estate_memberships DROP CONSTRAINT IF EXISTS estate_memberships_membership_role_check;
ALTER TABLE public.estate_memberships ADD CONSTRAINT estate_memberships_membership_role_check
CHECK (membership_role IN ('resident','security','facility_manager','estate_manager','estate_admin','finance_admin','event_organiser'));
CREATE TABLE IF NOT EXISTS public.estate_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
 venue text NOT NULL CHECK (char_length(trim(venue)) BETWEEN 2 AND 240),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT estate_events_valid_period CHECK (ends_at > starts_at),
 CONSTRAINT estate_events_id_estate_unique UNIQUE (id, estate_id)
);
CREATE INDEX IF NOT EXISTS idx_estate_events_estate_start ON public.estate_events (estate_id, starts_at DESC);
ALTER TABLE public.estate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY estate_events_select_member ON public.estate_events FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_events.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active')
 OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role='platform_admin')
);
CREATE POLICY estate_events_insert_organiser ON public.estate_events FOR INSERT TO authenticated WITH CHECK (
 created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_events.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser')
);
CREATE POLICY estate_events_update_organiser ON public.estate_events FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_events.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role='platform_admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=estate_events.estate_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.membership_role='event_organiser') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role='platform_admin'));
CREATE OR REPLACE FUNCTION private.validate_estate_event_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id=NEW.estate_id AND m.user_id=NEW.created_by AND m.status='active' AND m.membership_role='event_organiser') THEN
  RAISE EXCEPTION 'Event creator must be an active event organiser in the same estate' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_estate_event_creator() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS estate_events_validate_creator ON public.estate_events;
CREATE TRIGGER estate_events_validate_creator BEFORE INSERT OR UPDATE OF estate_id, created_by ON public.estate_events FOR EACH ROW EXECUTE FUNCTION private.validate_estate_event_creator();
COMMIT;