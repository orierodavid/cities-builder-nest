-- Safe resident-to-unit assignment constraints.
-- Apply after 006_estate_role_onboarding.sql.
BEGIN;

-- A unit and a resident can each have at most one active assignment.
CREATE UNIQUE INDEX IF NOT EXISTS resident_units_one_active_resident_per_unit
  ON public.resident_units (unit_id)
  WHERE end_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resident_units_one_active_unit_per_resident
  ON public.resident_units (estate_id, resident_user_id)
  WHERE end_date IS NULL;

-- Require an assigned manager, an active resident membership, and an available
-- unit in the same estate for direct authenticated inserts.
DROP POLICY IF EXISTS resident_units_insert_manager ON public.resident_units;
CREATE POLICY resident_units_insert_manager ON public.resident_units
  FOR INSERT TO authenticated
  WITH CHECK (
    end_date IS NULL
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = resident_units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships resident
      WHERE resident.estate_id = resident_units.estate_id
        AND resident.user_id = resident_units.resident_user_id
        AND resident.status = 'active'
        AND resident.membership_role = 'resident'
    )
    AND EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = resident_units.unit_id
        AND u.estate_id = resident_units.estate_id
        AND u.status = 'available'
    )
  );

COMMIT;
