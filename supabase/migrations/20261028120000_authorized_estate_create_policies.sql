-- Phase 1 follow-up: enable the authenticated API's authorized create workflows.
-- Policies are deliberately operation-specific and estate-scoped.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_active_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = target_user_id AND u.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_user(uuid) TO authenticated;

-- The platform admin is the only role allowed to create estates.
DROP POLICY IF EXISTS estates_insert_platform_admin ON public.estates;
CREATE POLICY estates_insert_platform_admin
ON public.estates
FOR INSERT TO authenticated
WITH CHECK (private.is_platform_admin());

-- Platform admins can assign any supported membership. An active estate manager
-- can only add an active resident to the same enabled estate they manage.
DROP POLICY IF EXISTS estate_memberships_insert_authorized ON public.estate_memberships;
CREATE POLICY estate_memberships_insert_authorized
ON public.estate_memberships
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = estate_memberships.estate_id AND e.is_enabled = true
  )
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

-- Managers/platform admins can create buildings only inside enabled estates.
DROP POLICY IF EXISTS buildings_insert_manager_same_estate ON public.buildings;
CREATE POLICY buildings_insert_manager_same_estate
ON public.buildings
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = buildings.estate_id AND e.is_enabled = true
  )
  AND (private.is_platform_admin() OR private.is_active_estate_manager(buildings.estate_id))
);

-- Units must belong to an existing building in the same enabled estate.
DROP POLICY IF EXISTS units_insert_manager_same_estate ON public.units;
CREATE POLICY units_insert_manager_same_estate
ON public.units
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = units.estate_id AND e.is_enabled = true
  )
  AND (private.is_platform_admin() OR private.is_active_estate_manager(units.estate_id))
  AND EXISTS (
    SELECT 1 FROM public.buildings b
    WHERE b.id = units.building_id AND b.estate_id = units.estate_id
  )
);

COMMIT;
