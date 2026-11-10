-- Estate service charges and provider-confirmed payment ledger.
create table if not exists public.estate_service_charges (
 id uuid primary key default gen_random_uuid(),
 estate_id uuid not null references public.estates(id) on delete cascade,
 title text not null check (char_length(trim(title)) between 2 and 140),
 description text,
 amount_kobo bigint not null check (amount_kobo>0),
 due_date date,
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists estate_service_charges_estate_idx
 on public.estate_service_charges(estate_id,is_active,due_date);

create table if not exists public.service_charge_payments (
 id uuid primary key default gen_random_uuid(),
 charge_id uuid not null references public.estate_service_charges(id) on delete restrict,
 estate_id uuid not null references public.estates(id) on delete restrict,
 resident_user_id uuid not null references auth.users(id) on delete restrict,
 amount_kobo bigint not null check (amount_kobo>0),
 currency char(3) not null default 'NGN',
 status text not null default 'pending' check(status in ('pending','successful','failed','reversed')),
 provider text,
 provider_reference text unique,
 verified_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists service_charge_payments_resident_idx
 on public.service_charge_payments(resident_user_id,created_at desc);

alter table public.estate_service_charges enable row level security;
alter table public.service_charge_payments enable row level security;
grant select,insert,update on public.estate_service_charges to authenticated;
grant select on public.service_charge_payments to authenticated;

create policy "Managers manage charges in assigned estates"
 on public.estate_service_charges for all to authenticated
 using(exists(
  select 1 from public.estate_memberships em
  where em.estate_id=estate_service_charges.estate_id
   and em.user_id=(select auth.uid()) and em.status='active'
   and em.membership_role in ('facility_manager','estate_manager','estate_admin')
 ))
 with check(exists(
  select 1 from public.estate_memberships em
  where em.estate_id=estate_service_charges.estate_id
   and em.user_id=(select auth.uid()) and em.status='active'
   and em.membership_role in ('facility_manager','estate_manager','estate_admin')
   and em.user_id=estate_service_charges.created_by
 ));

create policy "Residents view charges in own estates"
 on public.estate_service_charges for select to authenticated
 using(is_active and exists(
  select 1 from public.estate_memberships em
  where em.estate_id=estate_service_charges.estate_id
   and em.user_id=(select auth.uid()) and em.status='active'
   and em.membership_role='resident'
 ));

create policy "Residents view own service charge payments"
 on public.service_charge_payments for select to authenticated
 using(resident_user_id=(select auth.uid()));

create policy "Managers view estate service charge payments"
 on public.service_charge_payments for select to authenticated
 using(exists(
  select 1 from public.estate_memberships em
  where em.estate_id=service_charge_payments.estate_id
   and em.user_id=(select auth.uid()) and em.status='active'
   and em.membership_role in ('facility_manager','estate_manager','estate_admin')
 ));

revoke insert,update,delete on public.service_charge_payments from anon,authenticated;
