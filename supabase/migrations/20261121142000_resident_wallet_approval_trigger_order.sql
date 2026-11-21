create or replace function private.ensure_resident_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Membership approval is authoritative here. The approval RPC updates the
  -- membership to active before it flips users.is_active, so checking that
  -- profile flag in this trigger would skip newly approved residents.
  if new.membership_role = 'resident' and new.status = 'active' then
    insert into public.resident_wallets (resident_user_id)
    values (new.user_id)
    on conflict (resident_user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_resident_wallet() from public, anon, authenticated;
