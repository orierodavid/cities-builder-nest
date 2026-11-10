drop policy if exists visitor_visits_security_insert on public.visitor_visits;

create policy visitor_visits_security_insert
on public.visitor_visits
for insert
to authenticated
with check (
  checked_in_by = auth.uid()
  and checked_out_by is null
  and checked_out_at is null
  and exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = visitor_visits.estate_id
      and m.user_id = auth.uid()
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