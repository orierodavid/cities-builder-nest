-- Auditable security-gate check-in and check-out records.
create table if not exists public.visitor_visits (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  visitor_pass_id uuid not null references public.visitor_passes(id) on delete restrict,
  checked_in_by uuid not null references public.users(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  checked_out_by uuid references public.users(id) on delete restrict,
  checked_out_at timestamptz,
  constraint visitor_visits_checkout_pair check ((checked_out_by is null) = (checked_out_at is null)),
  constraint visitor_visits_checkout_after_checkin check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create unique index if not exists visitor_visits_one_open_visit_per_pass
  on public.visitor_visits(visitor_pass_id) where checked_out_at is null;
create index if not exists visitor_visits_estate_open_idx
  on public.visitor_visits(estate_id, checked_in_at desc) where checked_out_at is null;
alter table public.visitor_visits enable row level security;
create policy visitor_visits_security_select on public.visitor_visits for select to authenticated using (
  exists (select 1 from public.estate_memberships m where m.estate_id = visitor_visits.estate_id and m.user_id = auth.uid() and m.status = 'active' and m.membership_role = 'security')
  or exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'platform_admin')
);
create policy visitor_visits_security_insert on public.visitor_visits for insert to authenticated with check (
  checked_in_by = auth.uid() and checked_out_by is null and checked_out_at is null
  and exists (select 1 from public.estate_memberships m where m.estate_id = visitor_visits.estate_id and m.user_id = auth.uid() and m.status = 'active' and m.membership_role = 'security')
  and exists (select 1 from public.visitor_passes p where p.id = visitor_pass_id and p.estate_id = estate_id)
);
create policy visitor_visits_security_checkout on public.visitor_visits for update to authenticated using (
  checked_out_at is null and exists (select 1 from public.estate_memberships m where m.estate_id = visitor_visits.estate_id and m.user_id = auth.uid() and m.status = 'active' and m.membership_role = 'security')
) with check (
  checked_out_by = auth.uid() and checked_out_at is not null and exists (select 1 from public.estate_memberships m where m.estate_id = visitor_visits.estate_id and m.user_id = auth.uid() and m.status = 'active' and m.membership_role = 'security')
);
