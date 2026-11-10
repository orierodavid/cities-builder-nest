-- Subscription lifecycle controls for estate tenants.
-- Estates remain enabled by default; platform admins can disable access when subscriptions lapse.
BEGIN;

ALTER TABLE public.estates
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_reason text;

ALTER TABLE public.estates
  DROP CONSTRAINT IF EXISTS estates_disabled_reason_length_check;
ALTER TABLE public.estates
  ADD CONSTRAINT estates_disabled_reason_length_check
  CHECK (disabled_reason IS NULL OR char_length(disabled_reason) <= 500);

DROP POLICY IF EXISTS estates_update_platform_admin ON public.estates;
CREATE POLICY estates_update_platform_admin ON public.estates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

CREATE OR REPLACE FUNCTION private.reject_disabled_estate_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_estate_id uuid;
BEGIN
  target_estate_id := NEW.estate_id;
  IF target_estate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = target_estate_id AND e.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'Estate is disabled due to subscription status'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_disabled_estate_operations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS estate_enabled_memberships_guard ON public.estate_memberships;
CREATE TRIGGER estate_enabled_memberships_guard
BEFORE INSERT OR UPDATE OF estate_id, status, membership_role
ON public.estate_memberships
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_buildings_guard ON public.buildings;
CREATE TRIGGER estate_enabled_buildings_guard
BEFORE INSERT OR UPDATE OF estate_id
ON public.buildings
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_units_guard ON public.units;
CREATE TRIGGER estate_enabled_units_guard
BEFORE INSERT OR UPDATE OF estate_id, status, building_id
ON public.units
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_resident_units_guard ON public.resident_units;
CREATE TRIGGER estate_enabled_resident_units_guard
BEFORE INSERT OR UPDATE OF estate_id, unit_id, resident_user_id, end_date
ON public.resident_units
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_maintenance_guard ON public.maintenance_requests;
CREATE TRIGGER estate_enabled_maintenance_guard
BEFORE INSERT OR UPDATE OF estate_id, unit_id, status, assigned_to
ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_announcements_guard ON public.announcements;
CREATE TRIGGER estate_enabled_announcements_guard
BEFORE INSERT OR UPDATE OF estate_id
ON public.announcements
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

DROP TRIGGER IF EXISTS estate_enabled_visitor_passes_guard
ON public.visitor_passes;
CREATE TRIGGER estate_enabled_visitor_passes_guard
BEFORE INSERT OR UPDATE OF estate_id, host_user_id
ON public.visitor_passes
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

COMMIT;