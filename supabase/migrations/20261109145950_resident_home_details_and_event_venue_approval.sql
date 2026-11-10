
alter table public.users
  add column if not exists home_number text,
  add column if not exists street_name text;

alter table public.users
  add constraint users_home_number_length_check
    check (home_number is null or char_length(btrim(home_number)) between 1 and 80),
  add constraint users_street_name_length_check
    check (street_name is null or char_length(btrim(street_name)) between 2 and 160);

alter table public.estate_events
  add column if not exists venue_approval_status text not null default 'approved',
  add column if not exists venue_approval_requested_at timestamptz,
  add column if not exists venue_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists venue_approved_at timestamptz,
  add column if not exists venue_approval_note text;

alter table public.estate_events
  add constraint estate_events_venue_approval_status_check
  check (venue_approval_status in ('pending','approved','rejected'));

update public.estate_events
set venue_approval_status = case when venue_id is null then 'approved' else 'approved' end
where venue_approval_status is distinct from 'approved';

create index if not exists idx_estate_events_estate_created_starts
  on public.estate_events (estate_id, created_by, starts_at);
create index if not exists idx_estate_events_pending_venue_approval
  on public.estate_events (estate_id, venue_approval_requested_at desc)
  where venue_approval_status = 'pending';
create index if not exists idx_estate_memberships_estate_role_status_user
  on public.estate_memberships (estate_id, membership_role, status, user_id);

drop policy if exists estate_events_insert_resident on public.estate_events;
create policy estate_events_insert_resident
on public.estate_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.estate_memberships m
    where m.estate_id = estate_events.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role in ('resident','event_organiser')
  )
);

drop policy if exists estate_events_approve_by_management on public.estate_events;
create policy estate_events_approve_by_management
on public.estate_events for update to authenticated
using (
  exists (
    select 1 from public.estate_memberships m
    where m.estate_id = estate_events.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role in ('facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
)
with check (
  exists (
    select 1 from public.estate_memberships m
    where m.estate_id = estate_events.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role in ('facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
);

drop policy if exists users_update_estate_resident_details on public.users;
create policy users_update_estate_resident_details
on public.users for update to authenticated
using (
  exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status = 'active'
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
)
with check (
  exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status = 'active'
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
);
