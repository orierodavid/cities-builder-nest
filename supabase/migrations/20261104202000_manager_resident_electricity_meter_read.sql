BEGIN;
DROP POLICY IF EXISTS resident_electricity_meters_select_estate_manager ON public.resident_electricity_meters;
CREATE POLICY resident_electricity_meters_select_estate_manager
ON public.resident_electricity_meters
FOR SELECT TO authenticated
USING (
  private.is_platform_admin()
  OR private.is_active_estate_manager(estate_id)
);
COMMIT;