begin;

alter table public.users
  add column if not exists is_disabled boolean not null default false,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid,
  add column if not exists disabled_reason text,
  add column if not exists deleted_at timestamptz;

alter table public.users
  drop constraint if exists users_disabled_reason_length_check,
  add constraint users_disabled_reason_length_check
    check (disabled_reason is null or char_length(disabled_reason) <= 500),
  drop constraint if exists users_deleted_requires_disabled_check,
  add constraint users_deleted_requires_disabled_check
    check (deleted_at is null or is_disabled = true);

create index if not exists users_disabled_idx
  on public.users (is_disabled, deleted_at)
  where is_disabled = true or deleted_at is not null;

create or replace function private.is_account_access_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.is_disabled = false
      and u.deleted_at is null
  );
$$;

revoke all on function private.is_account_access_enabled() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_account_access_enabled() to authenticated;

-- A restrictive policy is ANDed with every existing permissive policy.
-- This makes disabled and deleted accounts lose direct Data API access even
-- while an already-issued access token has not yet expired.
do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity = true
  loop
    execute format(
      'drop policy if exists c_bnest_active_account_guard on %I.%I',
      v_table.schema_name, v_table.table_name
    );
    execute format(
      'create policy c_bnest_active_account_guard on %I.%I as restrictive for all to authenticated using ((select private.is_account_access_enabled())) with check ((select private.is_account_access_enabled()))',
      v_table.schema_name, v_table.table_name
    );
  end loop;
end;
$$;

-- Public/anonymous clients must never create or modify user profiles directly.
-- Registration and account administration use trusted server-side functions.
revoke all on public.users from anon;

create or replace function public.complete_self_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'platform_admin'
  ) then
    raise exception 'platform_admin_account_cannot_be_deleted' using errcode = '42501';
  end if;

  update public.resident_units
  set end_date = coalesce(end_date, current_date)
  where resident_user_id = p_user_id and end_date is null;

  update public.estate_memberships
  set status = 'ended'
  where user_id = p_user_id and status <> 'ended';

  delete from public.user_roles where user_id = p_user_id;

  -- Remove non-financial inbox/delivery data containing contact details.
  delete from public.resident_email_notifications where user_id = p_user_id;
  delete from public.resident_notification_recipients where recipient_user_id = p_user_id;
  delete from public.maintenance_management_notifications where recipient_user_id = p_user_id;
  delete from public.cookie_preferences where user_id = p_user_id;

  -- Keep the stable user ID referenced by financial, estate and audit records.
  -- Personal profile fields are anonymised rather than deleting ledger history.
  update public.users
  set full_name = 'Deleted account',
      first_name = null,
      last_name = null,
      phone_e164 = null,
      home_number = null,
      street_name = null,
      building_name = null,
      unit_number = null,
      is_disabled = true,
      disabled_at = coalesce(disabled_at, now()),
      disabled_by = p_user_id,
      disabled_reason = 'Account deleted by user',
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'account_profile_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.complete_self_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_self_account_deletion(uuid) to service_role;

commit;
