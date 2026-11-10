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
  on conflict on constraint account_login_lockouts_pkey do update
    set failed_attempts = public.account_login_lockouts.failed_attempts + 1,
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