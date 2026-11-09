-- Let residents manage only events they created, without changing event data or table structure.
-- Existing event_organiser memberships remain supported for backward compatibility.
BEGIN;

DROP POLICY IF EXISTS estate_events_select_member ON public.estate_events;
DROP POLICY IF EXISTS estate_events_insert_organiser ON public.estate_events;
DROP POLICY IF EXISTS estate_events_update_organiser ON public.estate_events;

CREATE POLICY estate_events_select_owner_or_legacy ON public.estate_events
  FOR SELECT TO authenticated USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_events.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'event_organiser'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
    )
  );

CREATE POLICY estate_events_insert_resident_or_legacy ON public.estate_events
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_events.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('resident', 'event_organiser')
    )
  );

CREATE POLICY estate_events_update_owner_or_legacy ON public.estate_events
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_events.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'event_organiser'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estate_events.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'event_organiser'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
    )
  );

CREATE OR REPLACE FUNCTION private.validate_estate_event_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = NEW.estate_id
      AND m.user_id = NEW.created_by
      AND m.status = 'active'
      AND m.membership_role IN ('resident', 'event_organiser')
  ) THEN
    RAISE EXCEPTION 'Event creator must be an active resident in the same estate'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS estate_event_guests_select_organiser ON public.estate_event_guests;
DROP POLICY IF EXISTS estate_event_guests_insert_organiser ON public.estate_event_guests;
DROP POLICY IF EXISTS estate_event_guests_update_organiser ON public.estate_event_guests;
DROP POLICY IF EXISTS estate_event_guests_delete_organiser ON public.estate_event_guests;

CREATE POLICY estate_event_guests_select_owner_or_legacy ON public.estate_event_guests
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_guests.event_id
        AND e.estate_id = estate_event_guests.estate_id
        AND (
          e.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.estate_memberships m
            WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
              AND m.status = 'active' AND m.membership_role = 'event_organiser'
          )
        )
    )
  );

CREATE POLICY estate_event_guests_insert_owner_or_legacy ON public.estate_event_guests
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_guests.event_id
        AND e.estate_id = estate_event_guests.estate_id
        AND (
          e.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.estate_memberships m
            WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
              AND m.status = 'active' AND m.membership_role = 'event_organiser'
          )
        )
    )
  );

CREATE POLICY estate_event_guests_update_owner_or_legacy ON public.estate_event_guests
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_guests.event_id AND e.estate_id = estate_event_guests.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_guests.event_id AND e.estate_id = estate_event_guests.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

CREATE POLICY estate_event_guests_delete_owner_or_legacy ON public.estate_event_guests
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_guests.event_id AND e.estate_id = estate_event_guests.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

DROP POLICY IF EXISTS estate_event_invitations_select_organiser ON public.estate_event_invitations;
DROP POLICY IF EXISTS estate_event_invitations_insert_organiser ON public.estate_event_invitations;
DROP POLICY IF EXISTS estate_event_invitations_update_organiser ON public.estate_event_invitations;

CREATE POLICY estate_event_invitations_select_owner_or_legacy ON public.estate_event_invitations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_invitations.event_id
        AND e.estate_id = estate_event_invitations.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

CREATE POLICY estate_event_invitations_insert_owner_or_legacy ON public.estate_event_invitations
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_invitations.event_id
        AND e.estate_id = estate_event_invitations.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

CREATE POLICY estate_event_invitations_update_owner_or_legacy ON public.estate_event_invitations
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_invitations.event_id
        AND e.estate_id = estate_event_invitations.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_invitations.event_id
        AND e.estate_id = estate_event_invitations.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

-- Residents can read attendance for their own events. Check-in writes remain on
-- the existing gate/security workflow and are not granted to residents here.
DROP POLICY IF EXISTS estate_event_checkins_select_organiser ON public.estate_event_checkins;
CREATE POLICY estate_event_checkins_select_owner_or_legacy ON public.estate_event_checkins
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_events e
      WHERE e.id = estate_event_checkins.event_id
        AND e.estate_id = estate_event_checkins.estate_id
        AND (e.created_by = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = e.estate_id AND m.user_id = (SELECT auth.uid())
            AND m.status = 'active' AND m.membership_role = 'event_organiser'
        ))
    )
  );

COMMIT;
