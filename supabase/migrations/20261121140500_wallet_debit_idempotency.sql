create or replace function private.post_wallet_debit(
  p_resident_user_id uuid, p_amount_kobo bigint, p_source text, p_external_reference text,
  p_description text, p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_wallet public.resident_wallets%rowtype;
  v_balance bigint;
  v_id uuid;
  v_existing public.wallet_transactions%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo > 9000000000000000
    or p_resident_user_id is null or p_source not in ('wallet_spend','admin_adjustment')
    or p_external_reference is null or char_length(btrim(p_external_reference)) not between 1 and 160
    or p_description is null or char_length(btrim(p_description)) not between 1 and 200
    or coalesce(jsonb_typeof(p_metadata), 'object') <> 'object' then
    raise exception 'invalid_wallet_debit' using errcode = '22023';
  end if;

  -- Idempotency must be checked before balance: a retry of a successful debit
  -- must return the original transaction even though the balance has changed.
  select * into v_existing from public.wallet_transactions
  where external_reference = btrim(p_external_reference);
  if found then
    if v_existing.resident_user_id <> p_resident_user_id
      or v_existing.amount_kobo <> p_amount_kobo or v_existing.entry_type <> 'debit' then
      raise exception 'wallet_debit_reference_conflict' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  select * into v_wallet from public.resident_wallets
  where resident_user_id = p_resident_user_id and status = 'active'
  for update;
  if not found then raise exception 'active_wallet_not_found' using errcode = 'P0002'; end if;

  select coalesce(sum(case when entry_type = 'credit' then amount_kobo else -amount_kobo end), 0)::bigint
  into v_balance from public.wallet_transactions
  where wallet_id = v_wallet.id and status = 'posted';
  if v_balance < p_amount_kobo then
    raise exception 'insufficient_wallet_funds' using errcode = 'P0001';
  end if;

  insert into public.wallet_transactions (
    wallet_id,resident_user_id,entry_type,amount_kobo,source,external_reference,description,metadata
  ) values (
    v_wallet.id,p_resident_user_id,'debit',p_amount_kobo,p_source,btrim(p_external_reference),
    btrim(p_description),coalesce(p_metadata,'{}'::jsonb)
  ) on conflict (external_reference) do nothing returning id into v_id;

  if v_id is not null then return v_id; end if;
  select * into v_existing from public.wallet_transactions
  where external_reference = btrim(p_external_reference);
  if not found or v_existing.resident_user_id <> p_resident_user_id
    or v_existing.amount_kobo <> p_amount_kobo or v_existing.entry_type <> 'debit' then
    raise exception 'wallet_debit_reference_conflict' using errcode = '23505';
  end if;
  return v_existing.id;
end;
$$;