BEGIN;
DROP POLICY IF EXISTS maintenance_select_own_or_manager ON public.maintenance_requests;
DROP POLICY IF EXISTS maintenance_select_management_visibility ON public.maintenance_requests;
CREATE POLICY maintenance_select_management_visibility
ON public.maintenance_requests
FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR private.is_platform_admin()
  OR private.is_active_estate_manager(estate_id)
);
COMMIT;