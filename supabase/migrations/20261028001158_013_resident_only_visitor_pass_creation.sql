BEGIN;
DROP POLICY IF EXISTS visitor_passes_insert_host_member ON public.visitor_passes;
CREATE POLICY visitor_passes_insert_host_member ON public.visitor_passes
  FOR INSERT TO authenticated
  WITH CHECK (
    host_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = visitor_passes.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'resident'
    )
  );
CREATE OR REPLACE FUNCTION private.validate_estate_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  membership_status text;
  membership_role text;
BEGIN
  IF TG_TABLE_NAME = 'resident_units' THEN
    SELECT m.status, m.membership_role INTO membership_status, membership_role
    FROM public.estate_memberships m
    WHERE m.estate_id = NEW.estate_id AND m.user_id = NEW.resident_user_id;
    IF membership_status IS DISTINCT FROM 'active' OR membership_role IS DISTINCT FROM 'resident' THEN
      RAISE EXCEPTION 'Resident must have an active resident membership in the same estate' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'maintenance_requests' THEN
    IF NEW.created_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id AND m.user_id = NEW.created_by AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Request creator must be an active member of the request estate' USING ERRCODE = '23514';
    END IF;
    IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id AND m.user_id = NEW.assigned_to AND m.status = 'active'
        AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin', 'security')
    ) THEN
      RAISE EXCEPTION 'Assignee must have an active operational role in the request estate' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'visitor_passes' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id AND m.user_id = NEW.host_user_id
        AND m.status = 'active' AND m.membership_role = 'resident'
    ) THEN
      RAISE EXCEPTION 'Visitor pass host must be an active resident of the same estate' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;