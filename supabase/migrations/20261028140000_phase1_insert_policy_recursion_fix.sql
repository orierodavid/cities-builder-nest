-- Phase 1 follow-up: avoid estate-membership RLS recursion in INSERT checks.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_enabled_estate(target_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = target_estate_id AND e.is_enabled = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_enabled_estate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_enabled_estate(uuid) TO authenticated;

DROP POLICY IF EXISTS estate_memberships_insert_authorized ON public.estate_memberships;
CREATE POLICY estate_memberships_insert_authorized
ON public.estate_memberships
FOR INSERT TO authenticated
WITH CHECK (
  private.is_enabled_estate(estate_memberships.estate_id)
  AND private.is_active_user(estate_memberships.user_id)
  AND (
    private.is_platform_admin()
    OR (
      private.is_active_estate_manager(estate_memberships.estate_id)
      AND estate_memberships.membership_role = 'resident'
      AND estate_memberships.status = 'active'
    )
  )
);

DROP POLICY IF EXISTS buildings_insert_manager_same_estate ON public.buildings;
CREATE POLICY buildings_insert_manager_same_estate
ON public.buildings
FOR INSERT TO authenticated
WITH CHECK (
  private.is_enabled_estate(buildings.estate_id)
  AND (private.is_platform_admin() OR private.is_active_estate_manager(buildings.estate_id))
);

DROP POLICY IF EXISTS units_insert_manager_same_estate ON public.units;
CREATE POLICY units_insert_manager_same_estate
ON public.units
FOR INSERT TO authenticated
WITH CHECK (
  private.is_enabled_estate(units.estate_id)
  AND (private.is_platform_admin() OR private.is_active_estate_manager(units.estate_id))
  AND EXISTS (
    SELECT 1 FROM public.buildings b
    WHERE b.id = units.building_id AND b.estate_id = units.estate_id
  )
);

DROP POLICY IF EXISTS resident_units_insert_manager_same_estate ON public.resident_units;
CREATE POLICY resident_units_insert_manager_same_estate
ON public.resident_units
FOR INSERT TO authenticated
WITH CHECK (
  private.is_enabled_estate(resident_units.estate_id)
  AND (
    private.is_platform_admin()
    OR private.is_active_estate_manager(resident_units.estate_id)
  )
  AND private.is_active_user(resident_units.resident_user_id)
  AND EXISTS (
    SELECT 1
    FROM public.estate_memberships m
    WHERE m.estate_id = resident_units.estate_id
      AND m.user_id = resident_units.resident_user_id
      AND m.membership_role = 'resident'
      AND m.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.units u
    WHERE u.id = resident_units.unit_id
      AND u.estate_id = resident_units.estate_id
  )
);

COMMIT;
