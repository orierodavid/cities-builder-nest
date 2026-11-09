drop policy if exists estate_events_update_organiser on public.estate_events;
create policy estate_events_update_organiser
on public.estate_events for update to authenticated
using (
  (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.estate_memberships owner_membership
      where owner_membership.estate_id = estate_events.estate_id
        and owner_membership.user_id = (select auth.uid())
        and owner_membership.status = 'active'
        and owner_membership.membership_role = 'resident'
    )
  )
  or exists (
    select 1 from public.estate_memberships manager_membership
    where manager_membership.estate_id = estate_events.estate_id
      and manager_membership.user_id = (select auth.uid())
      and manager_membership.status = 'active'
      and manager_membership.membership_role in ('event_organiser','facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
)
with check (
  (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.estate_memberships owner_membership
      where owner_membership.estate_id = estate_events.estate_id
        and owner_membership.user_id = (select auth.uid())
        and owner_membership.status = 'active'
        and owner_membership.membership_role = 'resident'
    )
  )
  or exists (
    select 1 from public.estate_memberships manager_membership
    where manager_membership.estate_id = estate_events.estate_id
      and manager_membership.user_id = (select auth.uid())
      and manager_membership.status = 'active'
      and manager_membership.membership_role in ('event_organiser','facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
);