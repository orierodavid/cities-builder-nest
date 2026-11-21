-- Resident wallet core: create a wallet on resident activation; no automatic funding.
create table if not exists public.resident_wallets (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null unique references auth.users(id) on delete restrict,
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resident_wallets_id_user_unique unique (id, resident_user_id)
);
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  entry_type text not null check (entry_type in ('credit', 'debit')),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  source text not null check (source in ('squad_virtual_account','paystack_virtual_account','moniepoint_virtual_account','squad_checkout','paystack_checkout','moniepoint_checkout','wallet_spend','wallet_refund','admin_adjustment')),
  external_reference text not null unique check (char_length(btrim(external_reference)) between 1 and 160),
  provider_reference text,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  status text not null default 'posted' check (status = 'posted'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint wallet_transactions_wallet_owner_fk foreign key (wallet_id, resident_user_id) references public.resident_wallets(id, resident_user_id) on delete restrict
);
create index if not exists wallet_transactions_resident_created_idx on public.wallet_transactions(resident_user_id, created_at desc);
create index if not exists wallet_transactions_wallet_created_idx on public.wallet_transactions(wallet_id, created_at desc);
alter table public.resident_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
revoke all on public.resident_wallets from anon, authenticated;
revoke all on public.wallet_transactions from anon, authenticated;
grant select on public.resident_wallets to authenticated;
grant select on public.wallet_transactions to authenticated;
grant all on public.resident_wallets to service_role;
grant all on public.wallet_transactions to service_role;
drop policy if exists resident_wallets_select_own on public.resident_wallets;
create policy resident_wallets_select_own on public.resident_wallets for select to authenticated using (resident_user_id = (select auth.uid()));
drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own on public.wallet_transactions for select to authenticated using (resident_user_id = (select auth.uid()));
create or replace function private.ensure_resident_wallet()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.membership_role = 'resident' and new.status = 'active'
     and exists (select 1 from public.users u where u.id = new.user_id and u.is_active = true and coalesce(u.is_disabled, false) = false and u.deleted_at is null) then
    insert into public.resident_wallets (resident_user_id) values (new.user_id) on conflict (resident_user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_resident_wallet() from public, anon, authenticated;
drop trigger if exists ensure_wallet_after_resident_membership on public.estate_memberships;
create trigger ensure_wallet_after_resident_membership after insert or update of status, membership_role on public.estate_memberships for each row execute function private.ensure_resident_wallet();
insert into public.resident_wallets (resident_user_id)
select distinct em.user_id from public.estate_memberships em join public.users u on u.id = em.user_id
where em.membership_role = 'resident' and em.status = 'active' and u.is_active = true and coalesce(u.is_disabled, false) = false and u.deleted_at is null
on conflict (resident_user_id) do nothing;
create or replace function public.get_my_wallet_balance()
returns table(wallet_id uuid, balance_kobo bigint, currency char(3), status text)
language sql stable security definer set search_path = ''
as $$
  select w.id, coalesce(sum(case when t.entry_type = 'credit' then t.amount_kobo else -t.amount_kobo end), 0)::bigint, w.currency, w.status
  from public.resident_wallets w left join public.wallet_transactions t on t.wallet_id = w.id and t.status = 'posted'
  where w.resident_user_id = (select auth.uid()) group by w.id, w.currency, w.status;
$$;
revoke all on function public.get_my_wallet_balance() from public, anon;
grant execute on function public.get_my_wallet_balance() to authenticated;
create or replace function private.post_wallet_credit(p_resident_user_id uuid,p_amount_kobo bigint,p_source text,p_external_reference text,p_provider_reference text,p_description text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_wallet public.resident_wallets%rowtype; v_id uuid; v_existing public.wallet_transactions%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo > 9000000000000000 or p_resident_user_id is null
    or p_source not in ('squad_virtual_account','paystack_virtual_account','moniepoint_virtual_account','squad_checkout','paystack_checkout','moniepoint_checkout','wallet_refund','admin_adjustment')
    or p_external_reference is null or char_length(btrim(p_external_reference)) not between 1 and 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 200 or coalesce(jsonb_typeof(p_metadata), 'object') <> 'object' then
    raise exception 'invalid_wallet_credit' using errcode = '22023';
  end if;
  select * into v_wallet from public.resident_wallets where resident_user_id = p_resident_user_id and status = 'active' for update;
  if not found then raise exception 'active_wallet_not_found' using errcode = 'P0002'; end if;
  insert into public.wallet_transactions(wallet_id,resident_user_id,entry_type,amount_kobo,source,external_reference,provider_reference,description,metadata)
  values(v_wallet.id,p_resident_user_id,'credit',p_amount_kobo,p_source,btrim(p_external_reference),nullif(btrim(p_provider_reference),''),btrim(p_description),coalesce(p_metadata,'{}'::jsonb))
  on conflict(external_reference) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into v_existing from public.wallet_transactions where external_reference=btrim(p_external_reference);
  if not found or v_existing.resident_user_id <> p_resident_user_id or v_existing.amount_kobo <> p_amount_kobo or v_existing.entry_type <> 'credit' then raise exception 'wallet_credit_reference_conflict' using errcode = '23505'; end if;
  return v_existing.id;
end;
$$;
create or replace function private.post_wallet_debit(p_resident_user_id uuid,p_amount_kobo bigint,p_source text,p_external_reference text,p_description text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_wallet public.resident_wallets%rowtype; v_balance bigint; v_id uuid; v_existing public.wallet_transactions%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo > 9000000000000000 or p_resident_user_id is null
    or p_source not in ('wallet_spend','admin_adjustment') or p_external_reference is null or char_length(btrim(p_external_reference)) not between 1 and 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 200 or coalesce(jsonb_typeof(p_metadata), 'object') <> 'object' then
    raise exception 'invalid_wallet_debit' using errcode = '22023';
  end if;
  select * into v_wallet from public.resident_wallets where resident_user_id = p_resident_user_id and status = 'active' for update;
  if not found then raise exception 'active_wallet_not_found' using errcode = 'P0002'; end if;
  select coalesce(sum(case when entry_type='credit' then amount_kobo else -amount_kobo end),0)::bigint into v_balance from public.wallet_transactions where wallet_id=v_wallet.id and status='posted';
  if v_balance < p_amount_kobo then raise exception 'insufficient_wallet_funds' using errcode = 'P0001'; end if;
  insert into public.wallet_transactions(wallet_id,resident_user_id,entry_type,amount_kobo,source,external_reference,description,metadata)
  values(v_wallet.id,p_resident_user_id,'debit',p_amount_kobo,p_source,btrim(p_external_reference),btrim(p_description),coalesce(p_metadata,'{}'::jsonb))
  on conflict(external_reference) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into v_existing from public.wallet_transactions where external_reference=btrim(p_external_reference);
  if not found or v_existing.resident_user_id <> p_resident_user_id or v_existing.amount_kobo <> p_amount_kobo or v_existing.entry_type <> 'debit' then raise exception 'wallet_debit_reference_conflict' using errcode = '23505'; end if;
  return v_existing.id;
end;
$$;
revoke all on function private.post_wallet_credit(uuid,bigint,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.post_wallet_debit(uuid,bigint,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.post_wallet_credit(uuid,bigint,text,text,text,text,jsonb) to service_role;
grant execute on function private.post_wallet_debit(uuid,bigint,text,text,text,jsonb) to service_role;
create or replace function private.prevent_wallet_transaction_mutation()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin raise exception 'wallet_transactions_are_immutable' using errcode = '42501'; end; $$;
revoke all on function private.prevent_wallet_transaction_mutation() from public, anon, authenticated;
drop trigger if exists wallet_transactions_immutable on public.wallet_transactions;
create trigger wallet_transactions_immutable before update or delete on public.wallet_transactions for each row execute function private.prevent_wallet_transaction_mutation();
