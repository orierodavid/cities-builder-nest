-- Keep the event/user policy count lean by extending the existing policies.
drop policy if exists estate_events_insert_resident on public.estate_events;
drop policy if exists estate_events_insert_organiser on public.estate_events;
create policy estate_events_insert_organiser
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
drop policy if exists estate_events_update_organiser on public.estate_events;
create policy estate_events_update_organiser
on public.estate_events for update to authenticated
using (
  exists (
    select 1 from public.estate_memberships m
    where m.estate_id = estate_events.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role in ('event_organiser','facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
)
with check (
  exists (
    select 1 from public.estate_memberships m
    where m.estate_id = estate_events.estate_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.membership_role in ('event_organiser','facility_manager','estate_manager','estate_admin')
  )
  or private.is_platform_admin()
);

drop policy if exists users_update_estate_resident_details on public.users;
drop policy if exists users_update_own_profile on public.users;
create policy users_update_own_profile
on public.users for update to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status in ('active','invited')
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
)
with check (
  id = (select auth.uid())
  or exists (
    select 1 from public.estate_memberships target_resident
    where target_resident.user_id = users.id
      and target_resident.membership_role = 'resident'
      and target_resident.status in ('active','invited')
      and private.is_active_estate_manager(target_resident.estate_id)
  )
  or private.is_platform_admin()
);

-- Cover foreign keys used by joins and deletes to reduce table scans.
create index if not exists idx_estate_events_venue_approved_by_fk on public.estate_events (venue_approved_by);
create index if not exists idx_estate_events_venue_estate_fk on public.estate_events (venue_id, estate_id);
create index if not exists idx_estate_venues_created_by_fk on public.estate_venues (created_by);
create index if not exists idx_maintenance_requests_responded_by_fk on public.maintenance_requests (responded_by);
create index if not exists idx_resident_email_notifications_estate_fk on public.resident_email_notifications (estate_id);
create index if not exists idx_resident_notifications_maintenance_fk on public.resident_notifications (maintenance_request_id);
create index if not exists idx_utility_transactions_validation_fk on public.utility_transactions (validation_id);
create index if not exists idx_utility_validations_estate_fk on public.utility_validations (estate_id);
