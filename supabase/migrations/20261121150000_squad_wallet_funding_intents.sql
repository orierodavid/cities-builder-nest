create table if not exists public.squad_wallet_funding_intents (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo between 10000 and 100000000000),
  currency character(3) not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  checkout_url text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  last_reconciled_at timestamptz
);
create index if not exists squad_wallet_funding_intents_pending_idx
  on public.squad_wallet_funding_intents(created_at)
  where status in ('pending','failed') and verified_at is null;
alter table public.squad_wallet_funding_intents enable row level security;
revoke all on public.squad_wallet_funding_intents from anon, authenticated;
grant all on public.squad_wallet_funding_intents to service_role;