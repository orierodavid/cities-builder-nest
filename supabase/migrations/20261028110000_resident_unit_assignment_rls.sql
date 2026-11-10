-- Phase 1 follow-up: allow authorized estate managers to assign residents to units.
-- This is intentionally INSERT-only; resident assignment changes must use a separately
-- reviewed workflow and must not be enabled by this policy.
BEGIN;

DROP POLICY IF EXISTS resident_units_insert_manager_same_estate ON public.resident_units;
CREATE POLICY resident_units_insert_manager_same_estate
ON public.resident_units
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.estates e
    WHERE e.id = resident_units.estate_id
      AND e.is_enabled = true
  )
  AND (
    private.is_platform_admin()
    OR private.is_active_estate_manager(resident_units.estate_id)
  )
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
