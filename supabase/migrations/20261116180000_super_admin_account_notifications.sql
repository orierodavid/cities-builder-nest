begin;

-- Queue one notification per existing Super Admin when an account receives
-- its first estate membership, or when a new platform-wide Super Admin role
-- is assigned. Delivery is handled by the existing durable email worker.
create or replace function private.queue_super_admin_account_created_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_estate_id uuid;
  v_role_label text;
  v_estate_name text;
  v_full_name text;
  v_account_email text;
  v_created_at timestamptz := now();
  v_recipient record;
  v_message text;
begin
  if tg_table_name = 'user_roles' then
    if new.role::text <> 'platform_admin' then
      return new;
    end if;
    v_user_id := new.user_id;
    v_role_label := 'Super Admin';
  elsif tg_table_name = 'estate_memberships' then
    v_user_id := new.user_id;
    v_estate_id := new.estate_id;
    v_role_label := initcap(replace(new.membership_role::text, '_', ' '));
    select e.name into v_estate_name
    from public.estates e
    where e.id = v_estate_id;
  else
    return new;
  end if;

  select u.full_name, au.email, coalesce(u.created_at, v_created_at)
    into v_full_name, v_account_email, v_created_at
  from public.users u
  join auth.users au on au.id = u.id
  where u.id = v_user_id;

  if v_account_email is null then
    return new;
  end if;

  v_message := format(
    E'A new CB Nest account has been created.\n\nName: %s\nEmail: %s\nRole: %s\nEstate: %s\nCreated: %s\n\nSign in to the CB Nest management portal to review the account.',
    coalesce(v_full_name, 'Name not provided'),
    v_account_email,
    coalesce(v_role_label, 'User'),
    coalesce(v_estate_name, 'Platform-wide'),
    to_char(v_created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')
  );

  for v_recipient in
    select r.user_id, au.email, coalesce(u.full_name, 'Super Admin') as full_name
    from public.user_roles r
    join auth.users au on au.id = r.user_id
    left join public.users u on u.id = r.user_id
    where r.role::text = 'platform_admin'
      and r.user_id <> v_user_id
      and au.email is not null
      and coalesce(u.is_active, true) = true
      and coalesce(u.is_disabled, false) = false
      and u.deleted_at is null
  loop
    insert into public.background_jobs (
      job_type, payload, idempotency_key, max_attempts
    ) values (
      'email.send',
      jsonb_build_object(
        'recipientEmail', v_recipient.email,
        'recipientName', v_recipient.full_name,
        'subject', 'New CB Nest account created',
        'message', v_message
      ),
      'account-created:' || v_user_id::text || ':' || v_recipient.user_id::text,
      8
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function private.queue_super_admin_account_created_email() from public, anon, authenticated;

drop trigger if exists notify_super_admins_on_estate_account_created on public.estate_memberships;
create trigger notify_super_admins_on_estate_account_created
after insert on public.estate_memberships
for each row execute function private.queue_super_admin_account_created_email();

drop trigger if exists notify_existing_super_admins_on_super_admin_created on public.user_roles;
create trigger notify_existing_super_admins_on_super_admin_created
after insert on public.user_roles
for each row execute function private.queue_super_admin_account_created_email();

commit;
