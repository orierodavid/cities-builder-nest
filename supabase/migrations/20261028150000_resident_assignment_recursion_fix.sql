-- Phase 1 follow-up: break the RLS cycle between resident_units, memberships, and units.
BEGIN;

CREATE OR REPLACE FUNCTION private.has_active_resident_membership(
  target_estate_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = target_estate_id
      AND m.user_id = target_user_id
      AND m.membership_role = 'resident'
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.unit_belongs_to_estate(
  target_unit_id uuid,
  target_estate_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = target_unit_id
      AND u.estate_id = target_estate_id
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_resident_membership(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.unit_belongs_to_estate(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_active_resident_membership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.unit_belongs_to_estate(uuid, uuid) TO authenticated;

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
  AND private.has_active_resident_membership(
    resident_units.estate_id,
    resident_units.resident_user_id
  )
  AND private.unit_belongs_to_estate(
    resident_units.unit_id,
    resident_units.estate_id
  )
);

COMMIT;
