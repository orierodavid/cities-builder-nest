drop policy if exists users_update_estate_resident_details on public.users;
create policy users_update_estate_resident_details
on public.users for update to authenticated
using (
  exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status in ('active','invited')
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
)
with check (
  exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status in ('active','invited')
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
);