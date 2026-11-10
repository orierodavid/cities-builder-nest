create policy "memberships_select_estate_manager_all_users"
on public.estate_memberships
for select
to authenticated
using (private.is_active_estate_manager(estate_id));

create policy "users_select_active_estate_members"
on public.users
for select
to authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.estate_memberships target_membership
    where target_membership.user_id = users.id
      and target_membership.status = 'active'
      and private.is_active_estate_manager(target_membership.estate_id)
  )
);