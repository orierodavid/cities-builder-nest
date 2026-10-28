-- Phase 1 authorization hardening: allow estate managers to read only profiles
-- of active residents in estates they manage. RLS remains the boundary.
BEGIN;

DROP POLICY IF EXISTS users_select_estate_manager_residents ON public.users;
CREATE POLICY users_select_estate_manager_residents ON public.users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.estate_memberships target_resident
      JOIN public.estate_memberships manager
        ON manager.estate_id = target_resident.estate_id
      WHERE target_resident.user_id = users.id
        AND target_resident.membership_role = 'resident'
        AND target_resident.status = 'active'
        AND manager.user_id = (SELECT auth.uid())
        AND manager.status = 'active'
        AND manager.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

COMMIT;
