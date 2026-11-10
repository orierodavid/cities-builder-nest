-- Audit trail for security staff denying an issued visitor pass.
create table if not exists public.visitor_pass_denials (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  visitor_pass_id uuid not null references public.visitor_passes(id) on delete restrict,
  denied_by uuid not null references public.users(id) on delete restrict,
  reason text,
  denied_at timestamptz not null default now()
);
alter table public.visitor_pass_denials enable row level security;
create policy visitor_pass_denials_security_select on public.visitor_pass_denials
for select to authenticated using (
  exists (
    select 1 from public.estate_memberships m
    where m.estate_id = visitor_pass_denials.estate_id
      and m.user_id = auth.uid() and m.status = 'active'
      and m.membership_role = 'security'
  )
);