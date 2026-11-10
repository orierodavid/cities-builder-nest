drop policy if exists users_select_estate_manager_residents on public.users;
create policy users_select_estate_manager_residents
on public.users for select to authenticated
using (
  private.is_platform_admin()
  or exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status in ('active','invited')
      and private.is_active_estate_manager(target_resident.estate_id)
      and (users.is_active = true or target_resident.status = 'invited')
  )
);