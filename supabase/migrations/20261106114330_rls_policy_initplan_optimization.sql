-- Improve RLS query plans by evaluating auth.uid() once per statement
-- instead of once per candidate row. Authorization predicates remain unchanged.
begin;

drop policy if exists visitor_visits_security_select on public.visitor_visits;
create policy visitor_visits_security_select
on public.visitor_visits
for select
to authenticated
using (
  exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_visits.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role = 'security'
  )
  or exists (
    select 1
    from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'platform_admin'::public.app_role
  )
);

drop policy if exists visitor_visits_security_insert on public.visitor_visits;
create policy visitor_visits_security_insert
on public.visitor_visits
for insert
to authenticated
with check (
  checked_in_by = (select auth.uid())
  and checked_out_by is null
  and checked_out_at is null
  and exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_visits.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role = 'security'
  )
  and exists (
    select 1
    from public.visitor_passes p
    where p.id = visitor_visits.visitor_pass_id
      and p.estate_id = visitor_visits.estate_id
  )
);

drop policy if exists visitor_visits_security_checkout on public.visitor_visits;
create policy visitor_visits_security_checkout
on public.visitor_visits
for update
to authenticated
using (
  checked_out_at is null
  and exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_visits.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role = 'security'
  )
)
with check (
  checked_out_by = (select auth.uid())
  and checked_out_at is not null
  and exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_visits.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role = 'security'
  )
);

drop policy if exists visitor_pass_denials_security_select on public.visitor_pass_denials;
create policy visitor_pass_denials_security_select
on public.visitor_pass_denials
for select
to authenticated
using (
  exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_pass_denials.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role = 'security'
  )
);

drop policy if exists units_select_assigned_resident_or_manager on public.units;
create policy units_select_assigned_resident_or_manager
on public.units
for select
to authenticated
using (
  exists (
    select 1 from public.estates e
    where e.id = units.estate_id and e.is_enabled = true
  )
  and (
    private.is_platform_admin()
    or private.is_active_estate_manager(estate_id)
    or exists (
      select 1
      from public.resident_units ru
      join public.estate_memberships m
        on m.estate_id = ru.estate_id
       and m.user_id = ru.resident_user_id
      where ru.unit_id = units.id
        and ru.estate_id = units.estate_id
        and ru.resident_user_id = (select auth.uid())
        and m.status = 'active'
        and m.membership_role = 'resident'
        and ru.start_date <= current_date
        and (ru.end_date is null or ru.end_date >= current_date)
    )
  )
);

commit;