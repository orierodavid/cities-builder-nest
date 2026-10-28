-- Phase 1: tighten direct database access to resident and unit records.
-- SECURITY DEFINER helpers avoid recursive RLS when a policy needs to inspect memberships.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_active_estate_manager(target_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.estate_memberships m
    JOIN public.estates e ON e.id = m.estate_id
    WHERE m.estate_id = target_estate_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
      AND e.is_enabled = true
  );
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'platform_admin'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_estate_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_estate_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

-- Managers can query resident membership IDs only within estates they actively manage.
-- Platform administrators retain their platform-wide administrative visibility.
DROP POLICY IF EXISTS memberships_select_estate_manager_residents ON public.estate_memberships;
CREATE POLICY memberships_select_estate_manager_residents
ON public.estate_memberships
FOR SELECT
TO authenticated
USING (
  (membership_role = 'resident' AND private.is_active_estate_manager(estate_id))
  OR private.is_platform_admin()
);

-- Unit visibility is limited to managers/platform admins and residents with a current
-- assignment to that specific unit. Security staff do not get a broad unit directory.
DROP POLICY IF EXISTS units_select_member ON public.units;
DROP POLICY IF EXISTS units_select_assigned_resident_or_manager ON public.units;
CREATE POLICY units_select_assigned_resident_or_manager
ON public.units
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = units.estate_id AND e.is_enabled = true
  )
  AND (
    private.is_platform_admin()
    OR private.is_active_estate_manager(units.estate_id)
    OR EXISTS (
      SELECT 1
      FROM public.resident_units ru
      JOIN public.estate_memberships m
        ON m.estate_id = ru.estate_id
       AND m.user_id = ru.resident_user_id
      WHERE ru.unit_id = units.id
        AND ru.estate_id = units.estate_id
        AND ru.resident_user_id = auth.uid()
        AND m.status = 'active'
        AND m.membership_role = 'resident'
        AND ru.start_date <= CURRENT_DATE
        AND (ru.end_date IS NULL OR ru.end_date >= CURRENT_DATE)
    )
  )
);

-- Managers can view only active resident profiles in enabled estates they manage.
-- Own-profile access remains covered by users_select_own.
DROP POLICY IF EXISTS users_select_estate_manager_residents ON public.users;
CREATE POLICY users_select_estate_manager_residents
ON public.users
FOR SELECT
TO authenticated
USING (
  (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.estate_memberships target_resident
      WHERE target_resident.user_id = users.id
        AND target_resident.membership_role = 'resident'
        AND target_resident.status = 'active'
        AND private.is_active_estate_manager(target_resident.estate_id)
    )
  )
  OR private.is_platform_admin()
);

COMMIT;
