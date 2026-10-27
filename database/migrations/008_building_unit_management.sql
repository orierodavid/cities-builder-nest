-- Estate-scoped building and unit creation.
-- Apply after migrations 006 and 007.
BEGIN;

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buildings_insert_manager ON public.buildings;
CREATE POLICY buildings_insert_manager ON public.buildings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = buildings.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS units_insert_manager ON public.units;
CREATE POLICY units_insert_manager ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'available'
    AND EXISTS (
      SELECT 1 FROM public.buildings b
      WHERE b.id = units.building_id
        AND b.estate_id = units.estate_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.estate_memberships m
        WHERE m.estate_id = units.estate_id
          AND m.user_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
          AND ur.role = 'platform_admin'
      )
    )
  );

COMMIT;
