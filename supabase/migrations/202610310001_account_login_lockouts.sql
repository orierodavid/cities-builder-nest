-- Progressive account lockout shared by web and mobile authentication.
create table if not exists public.account_login_lockouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  lock_stage integer not null default 0 check (lock_stage >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_login_lockouts enable row level security;
revoke all on public.account_login_lockouts from anon, authenticated;
grant all on public.account_login_lockouts to service_role;

create or replace function public.get_account_login_lockout(p_email text)
returns table(user_id uuid, locked_until timestamptz, lock_stage integer)
language sql
security definer
set search_path = ''
as $$
  select l.user_id, l.locked_until, l.lock_stage
  from public.account_login_lockouts l
  join auth.users u on u.id = l.user_id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

create or replace function public.record_account_login_failure(p_email text)
returns table(user_id uuid, failed_attempts integer, lock_stage integer, locked_until timestamptz, lock_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_failures integer;
  v_stage integer;
  v_locked_until timestamptz;
  v_minutes integer := 0;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    return;
  end if;

  insert into public.account_login_lockouts(user_id, failed_attempts, lock_stage, updated_at)
  values (v_user_id, 1, 0, now())
  on conflict (user_id) do update
    set failed_attempts = case
          when public.account_login_lockouts.locked_until is not null
               and public.account_login_lockouts.locked_until <= now()
          then public.account_login_lockouts.failed_attempts + 1
          else public.account_login_lockouts.failed_attempts + 1
        end,
        updated_at = now()
  returning public.account_login_lockouts.failed_attempts,
            public.account_login_lockouts.lock_stage,
            public.account_login_lockouts.locked_until
  into v_failures, v_stage, v_locked_until;

  if v_failures >= 4 then
    v_stage := v_stage + 1;
    v_minutes := case v_stage when 1 then 20 when 2 then 60 when 3 then 360 else 1440 end;
    v_locked_until := now() + make_interval(mins => v_minutes);
    update public.account_login_lockouts
      set failed_attempts = 0, lock_stage = v_stage,
          locked_until = v_locked_until, updated_at = now()
      where account_login_lockouts.user_id = v_user_id;
  end if;

  return query select v_user_id, v_failures, v_stage, v_locked_until, v_minutes;
end;
$$;

create or replace function public.reset_account_login_lockout(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.account_login_lockouts l
  using auth.users u
  where l.user_id = u.id and lower(u.email) = lower(trim(p_email));
end;
$$;

revoke all on function public.get_account_login_lockout(text) from public, anon, authenticated;
revoke all on function public.record_account_login_failure(text) from public, anon, authenticated;
revoke all on function public.reset_account_login_lockout(text) from public, anon, authenticated;
grant execute on function public.get_account_login_lockout(text) to service_role;
grant execute on function public.record_account_login_failure(text) to service_role;
grant execute on function public.reset_account_login_lockout(text) to service_role;
