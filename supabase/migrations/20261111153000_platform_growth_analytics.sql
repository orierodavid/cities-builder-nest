-- Platform-admin-only time-series and estate performance data for the management dashboard.
create or replace function public.get_platform_growth_analytics()
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

  with months as (
    select generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as month_start
  ),
  monthly_payments as (
    select date_trunc('month', coalesce(p.verified_at, p.created_at)) as month_start,
           count(*)::bigint as payment_count,
           coalesce(sum(p.amount_kobo), 0)::bigint as collected_kobo
    from public.service_charge_payments p
    where p.status = 'successful'
      and coalesce(p.verified_at, p.created_at) >= date_trunc('month', now()) - interval '11 months'
      and coalesce(p.verified_at, p.created_at) < date_trunc('month', now()) + interval '1 month'
    group by 1
  ),
  paid_by_obligation as (
    select p.charge_id, p.resident_user_id,
           sum(p.amount_kobo)::bigint as paid_kobo
    from public.service_charge_payments p
    where p.status = 'successful'
    group by p.charge_id, p.resident_user_id
  ),
  estate_obligations as (
    select c.estate_id,
           sum(greatest(c.amount_kobo - coalesce(p.paid_kobo, 0), 0))::bigint as outstanding_kobo
    from public.estate_service_charges c
    join public.estate_memberships m
      on m.estate_id = c.estate_id
     and m.status = 'active'
     and m.membership_role = 'resident'
    left join paid_by_obligation p
      on p.charge_id = c.id
     and p.resident_user_id = m.user_id
    where c.is_active = true
    group by c.estate_id
  ),
  estate_collections as (
    select p.estate_id,
           count(*)::bigint as payment_count,
           coalesce(sum(p.amount_kobo), 0)::bigint as collected_kobo
    from public.service_charge_payments p
    where p.status = 'successful'
    group by p.estate_id
  ),
  estate_rows as (
    select e.id as estate_id,
           e.name as estate_name,
           coalesce(ec.payment_count, 0) as payment_count,
           coalesce(ec.collected_kobo, 0) as collected_kobo,
           coalesce(eo.outstanding_kobo, 0) as outstanding_kobo,
           (select count(*)::bigint
            from public.estate_service_charges c
            where c.estate_id = e.id and c.is_active = true) as active_charges
    from public.estates e
    left join estate_collections ec on ec.estate_id = e.id
    left join estate_obligations eo on eo.estate_id = e.id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'verified_payments', (select count(*) from public.service_charge_payments where status = 'successful'),
      'active_charges', (select count(*) from public.estate_service_charges where is_active = true),
      'outstanding_kobo', (select coalesce(sum(outstanding_kobo), 0) from estate_obligations),
      'collected_kobo', (select coalesce(sum(collected_kobo), 0) from estate_collections)
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'label', to_char(m.month_start, 'Mon'),
        'payment_count', coalesce(mp.payment_count, 0),
        'collected_kobo', coalesce(mp.collected_kobo, 0)
      ) order by m.month_start)
      from months m
      left join monthly_payments mp on mp.month_start = m.month_start
    ), '[]'::jsonb),
    'estates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'estate_id', ranked.estate_id,
        'estate_name', ranked.estate_name,
        'payment_count', ranked.payment_count,
        'collected_kobo', ranked.collected_kobo,
        'outstanding_kobo', ranked.outstanding_kobo,
        'active_charges', ranked.active_charges
      ) order by ranked.collected_kobo desc, ranked.outstanding_kobo asc)
      from (
        select * from estate_rows
        order by collected_kobo desc, outstanding_kobo asc
        limit 6
      ) ranked
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_growth_analytics() from public, anon;
grant execute on function public.get_platform_growth_analytics() to authenticated;
