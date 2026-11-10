-- Resident service charges and electricity meter records.
create table if not exists public.estate_service_charges (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 140),
  description text,
  amount_kobo bigint not null check (amount_kobo > 0),
  due_date date,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists estate_service_charges_estate_idx on public.estate_service_charges(estate_id,is_active,due_date);

create table if not exists public.service_charge_payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.estate_service_charges(id) on delete restrict,
  estate_id uuid not null references public.estates(id) on delete restrict,
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','successful','failed','reversed')),
  provider text,
  provider_reference text unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists service_charge_payments_resident_idx on public.service_charge_payments(resident_user_id,created_at desc);

create table if not exists public.resident_electricity_meters (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users(id) on delete cascade,
  estate_id uuid not null references public.estates(id) on delete cascade,
  meter_number text not null check (char_length(trim(meter_number)) between 6 and 30),
  disco text not null check (disco in ('ikeja_electric','eko_electric','abuja_electric','kano_electric','port_harcourt_electric','jos_electric','kaduna_electric','ibadan_electric','enugu_electric','benin_electric','yola_electric')),
  meter_type text not null check (meter_type in ('prepaid','postpaid')),
  label text,
  created_at timestamptz not null default now(),
  unique(resident_user_id,meter_number)
);
create index if not exists resident_electricity_meters_user_idx on public.resident_electricity_meters(resident_user_id,created_at desc);

create table if not exists public.electricity_recharge_orders (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  estate_id uuid not null references public.estates(id) on delete restrict,
  meter_id uuid not null references public.resident_electricity_meters(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo >= 50000),
  currency char(3) not null default 'NGN',
  status text not null default 'awaiting_provider' check (status in ('awaiting_provider','pending','successful','failed','reversed')),
  provider text,
  provider_reference text unique,
  electricity_token text,
  units_purchased numeric(14,4),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists electricity_recharge_orders_resident_idx on public.electricity_recharge_orders(resident_user_id,created_at desc);

alter table public.estate_service_charges enable row level security;
alter table public.service_charge_payments enable row level security;
alter table public.resident_electricity_meters enable row level security;
alter table public.electricity_recharge_orders enable row level security;

grant select,insert,update on public.estate_service_charges to authenticated;
grant select on public.service_charge_payments to authenticated;
grant select,insert,update,delete on public.resident_electricity_meters to authenticated;
grant select on public.electricity_recharge_orders to authenticated;

drop policy if exists "Managers manage charges in assigned estates" on public.estate_service_charges;
create policy "Managers manage charges in assigned estates" on public.estate_service_charges
for all to authenticated
using (exists (
 select 1 from public.estate_memberships em
 where em.estate_id=estate_service_charges.estate_id
 and em.user_id=(select auth.uid()) and em.status='active'
 and em.membership_role in ('facility_manager','estate_manager','estate_admin')
))
with check (exists (
 select 1 from public.estate_memberships em
 where em.estate_id=estate_service_charges.estate_id
 and em.user_id=(select auth.uid()) and em.status='active'
 and em.membership_role in ('facility_manager','estate_manager','estate_admin')
 and em.user_id=estate_service_charges.created_by
));
drop policy if exists "Residents view charges in own estates" on public.estate_service_charges;
create policy "Residents view charges in own estates" on public.estate_service_charges
for select to authenticated using (
 is_active and exists (
  select 1 from public.estate_memberships em
  where em.estate_id=estate_service_charges.estate_id
  and em.user_id=(select auth.uid()) and em.status='active'
  and em.membership_role='resident'
 )
);

drop policy if exists "Residents view own service charge payments" on public.service_charge_payments;
create policy "Residents view own service charge payments" on public.service_charge_payments
for select to authenticated using (resident_user_id=(select auth.uid()));
drop policy if exists "Managers view estate service charge payments" on public.service_charge_payments;
create policy "Managers view estate service charge payments" on public.service_charge_payments
for select to authenticated using (exists (
 select 1 from public.estate_memberships em
 where em.estate_id=service_charge_payments.estate_id
 and em.user_id=(select auth.uid()) and em.status='active'
 and em.membership_role in ('facility_manager','estate_manager','estate_admin')
));

drop policy if exists "Residents manage own electricity meters" on public.resident_electricity_meters;
create policy "Residents manage own electricity meters" on public.resident_electricity_meters
for all to authenticated
using (resident_user_id=(select auth.uid()) and exists (
 select 1 from public.estate_memberships em where em.estate_id=resident_electricity_meters.estate_id
 and em.user_id=(select auth.uid()) and em.status='active' and em.membership_role='resident'
))
with check (resident_user_id=(select auth.uid()) and exists (
 select 1 from public.estate_memberships em where em.estate_id=resident_electricity_meters.estate_id
 and em.user_id=(select auth.uid()) and em.status='active' and em.membership_role='resident'
));
drop policy if exists "Residents view own recharge orders" on public.electricity_recharge_orders;
create policy "Residents view own recharge orders" on public.electricity_recharge_orders
for select to authenticated using (resident_user_id=(select auth.uid()));
drop policy if exists "Managers view estate recharge orders" on public.electricity_recharge_orders;
create policy "Managers view estate recharge orders" on public.electricity_recharge_orders
for select to authenticated using (exists (
 select 1 from public.estate_memberships em
 where em.estate_id=electricity_recharge_orders.estate_id
 and em.user_id=(select auth.uid()) and em.status='active'
 and em.membership_role in ('facility_manager','estate_manager','estate_admin')
));

revoke insert,update,delete on public.service_charge_payments from anon,authenticated;
revoke insert,update,delete on public.electricity_recharge_orders from anon,authenticated;
