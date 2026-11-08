create table if not exists public.estate_venues (
 id uuid primary key default gen_random_uuid(),
 estate_id uuid not null references public.estates(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 location text not null default '' check (char_length(location) <= 240),
 description text not null default '' check (char_length(description) <= 2000),
 capacity integer not null check (capacity between 1 and 100000),
 amenities text[] not null default '{}',
 status text not null default 'available' check (status in ('available','unavailable','maintenance')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (estate_id, name),
 unique (id, estate_id)
);
create index if not exists estate_venues_estate_status_idx on public.estate_venues(estate_id,status);
alter table public.estate_venues enable row level security;
grant select, insert, update, delete on public.estate_venues to authenticated;
drop policy if exists estate_venues_select_estate_members on public.estate_venues;
create policy estate_venues_select_estate_members on public.estate_venues for select to authenticated using (
 exists (select 1 from public.estate_memberships m where m.estate_id=estate_venues.estate_id and m.user_id=(select auth.uid()) and m.status='active')
 or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='platform_admin')
);
drop policy if exists estate_venues_manage_facility_management on public.estate_venues;
create policy estate_venues_manage_facility_management on public.estate_venues for all to authenticated
 using (
 exists (select 1 from public.estate_memberships m where m.estate_id=estate_venues.estate_id and m.user_id=(select auth.uid()) and m.status='active' and m.membership_role in ('facility_manager','estate_manager','estate_admin'))
 or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='platform_admin')
 )
 with check (
 exists (select 1 from public.estate_memberships m where m.estate_id=estate_venues.estate_id and m.user_id=(select auth.uid()) and m.status='active' and m.membership_role in ('facility_manager','estate_manager','estate_admin'))
 or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='platform_admin')
);
alter table public.estate_events add column if not exists venue_id uuid;
alter table public.estate_events add column if not exists expected_attendance integer;
alter table public.estate_events drop constraint if exists estate_events_expected_attendance_nonnegative;
alter table public.estate_events add constraint estate_events_expected_attendance_nonnegative check (expected_attendance is null or expected_attendance >= 0);
do $$ begin
 if not exists (select 1 from pg_constraint where conname='estate_events_venue_estate_fk') then
  alter table public.estate_events add constraint estate_events_venue_estate_fk foreign key (venue_id,estate_id) references public.estate_venues(id,estate_id) on delete restrict;
 end if;
end $$;
