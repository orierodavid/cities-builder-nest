alter table public.resident_virtual_accounts
  drop constraint if exists resident_virtual_accounts_resident_user_id_estate_id_key;
create unique index if not exists resident_virtual_accounts_resident_estate_provider_uidx
  on public.resident_virtual_accounts(resident_user_id, estate_id, provider);

create table if not exists public.paystack_wallet_funding_intents (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo between 10000 and 100000000000),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  checkout_url text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
alter table public.paystack_wallet_funding_intents enable row level security;
revoke all on public.paystack_wallet_funding_intents from anon, authenticated;
grant all on public.paystack_wallet_funding_intents to service_role;
create index if not exists paystack_wallet_funding_intents_resident_idx
  on public.paystack_wallet_funding_intents(resident_user_id, created_at desc);

create or replace function public.post_verified_wallet_credit(
  p_resident_user_id uuid, p_amount_kobo bigint, p_source text,
  p_external_reference text, p_provider_reference text, p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return private.post_wallet_credit(
    p_resident_user_id, p_amount_kobo, p_source, p_external_reference,
    p_provider_reference, p_description, p_metadata
  );
end;
$$;
revoke all on function public.post_verified_wallet_credit(uuid,bigint,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.post_verified_wallet_credit(uuid,bigint,text,text,text,text,jsonb) to service_role;
