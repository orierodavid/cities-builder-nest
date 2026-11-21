begin;

-- Global CB Nest payment fees. One configuration applies to every estate.
create table if not exists public.platform_payment_fee_settings (
  id smallint primary key default 1 check (id = 1),
  electricity_enabled boolean not null default false,
  electricity_fee_mode text not null default 'fixed' check (electricity_fee_mode in ('fixed','percentage')),
  electricity_fee_value bigint not null default 0 check (electricity_fee_value >= 0),
  service_charge_enabled boolean not null default false,
  service_charge_fee_mode text not null default 'fixed' check (service_charge_fee_mode in ('fixed','percentage')),
  service_charge_fee_value bigint not null default 0 check (service_charge_fee_value >= 0),
  rent_savings_enabled boolean not null default false,
  rent_savings_fee_mode text not null default 'fixed' check (rent_savings_fee_mode in ('fixed','percentage')),
  rent_savings_fee_value bigint not null default 0 check (rent_savings_fee_value >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_payment_fee_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_payment_fee_settings enable row level security;
revoke all on table public.platform_payment_fee_settings from anon, authenticated;
grant select, update on table public.platform_payment_fee_settings to authenticated;
grant all on table public.platform_payment_fee_settings to service_role;

drop policy if exists "Platform admins read global payment fee settings" on public.platform_payment_fee_settings;
create policy "Platform admins read global payment fee settings"
  on public.platform_payment_fee_settings for select to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'platform_admin'
  ));

drop policy if exists "Platform admins update global payment fee settings" on public.platform_payment_fee_settings;
create policy "Platform admins update global payment fee settings"
  on public.platform_payment_fee_settings for update to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'platform_admin'
  ))
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'platform_admin'
  ));

-- Preserve principal amounts in amount_kobo; fee and total are stored separately.
alter table public.service_charge_payments
  add column if not exists fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  add column if not exists total_amount_kobo bigint;
update public.service_charge_payments
  set total_amount_kobo = amount_kobo
  where total_amount_kobo is null;
alter table public.service_charge_payments
  alter column total_amount_kobo set not null;

alter table public.rent_savings_contributions
  add column if not exists fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  add column if not exists total_amount_kobo bigint;
update public.rent_savings_contributions
  set total_amount_kobo = amount_kobo
  where total_amount_kobo is null;
alter table public.rent_savings_contributions
  alter column total_amount_kobo set not null;

alter table public.utility_transactions
  add column if not exists fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  add column if not exists total_amount_kobo bigint;
update public.utility_transactions
  set total_amount_kobo = amount_kobo
  where total_amount_kobo is null;
alter table public.utility_transactions
  alter column total_amount_kobo set not null;

commit;