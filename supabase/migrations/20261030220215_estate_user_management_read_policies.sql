-- Restore the manager/platform-admin directory visibility policies recorded in the live migration history.
BEGIN;
GRANT SELECT ON public.users, public.estate_memberships TO authenticated;
DROP POLICY IF EXISTS memberships_select_estate_manager_all_users ON public.estate_memberships;
CREATE POLICY memberships_select_estate_manager_all_users
ON public.estate_memberships FOR SELECT TO authenticated
USING (private.is_active_estate_manager(estate_id));
DROP POLICY IF EXISTS memberships_select_estate_manager_residents ON public.estate_memberships;
CREATE POLICY memberships_select_estate_manager_residents
ON public.estate_memberships FOR SELECT TO authenticated
USING ((membership_role = 'resident' AND private.is_active_estate_manager(estate_id)) OR private.is_platform_admin());
DROP POLICY IF EXISTS users_select_active_estate_members ON public.users;
CREATE POLICY users_select_active_estate_members
ON public.users FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships target_membership
    WHERE target_membership.user_id = users.id
      AND target_membership.status = 'active'
      AND private.is_active_estate_manager(target_membership.estate_id)
  )
);
COMMIT;
