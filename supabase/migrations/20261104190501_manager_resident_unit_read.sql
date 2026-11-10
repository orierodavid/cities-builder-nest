BEGIN;
DROP POLICY IF EXISTS resident_units_select_estate_manager ON public.resident_units;
CREATE POLICY resident_units_select_estate_manager
ON public.resident_units
FOR SELECT TO authenticated
USING (
  private.is_platform_admin()
  OR private.is_active_estate_manager(estate_id)
);
COMMIT;