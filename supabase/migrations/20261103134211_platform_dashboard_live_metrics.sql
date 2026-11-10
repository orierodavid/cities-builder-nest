-- Authoritative, platform-admin-only aggregate metrics for the Super Admin dashboard.
create or replace function public.get_platform_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'platform_admin'::public.app_role
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  with obligations as (
    select c.id as charge_id, m.user_id as resident_user_id, c.amount_kobo
    from public.estate_service_charges c
    join public.estate_memberships m
      on m.estate_id = c.estate_id
     and m.status = 'active'
     and m.membership_role = 'resident'
    where c.is_active = true
  ),
  paid as (
    select p.charge_id, p.resident_user_id, sum(p.amount_kobo)::bigint as amount_kobo
    from public.service_charge_payments p
    where p.status = 'successful'
    group by p.charge_id, p.resident_user_id
  ),
  outstanding as (
    select coalesce(sum(greatest(o.amount_kobo - coalesce(p.amount_kobo, 0), 0)), 0)::bigint as amount_kobo
    from obligations o
    left join paid p
      on p.charge_id = o.charge_id
     and p.resident_user_id = o.resident_user_id
  )
  select jsonb_build_object(
    'estates', (select count(*) from public.estates),
    'users', (select count(*) from public.users),
    'properties', (select count(*) from public.units),
    'residents', (select count(distinct user_id) from public.estate_memberships where status = 'active' and membership_role = 'resident'),
    'charges', (select count(*) from public.estate_service_charges),
    'payments', (select count(*) from public.service_charge_payments where status = 'successful'),
    'outstanding_kobo', (select amount_kobo from outstanding),
    'maintenance', (select count(*) from public.maintenance_requests)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_dashboard_metrics() from public, anon;
grant execute on function public.get_platform_dashboard_metrics() to authenticated;