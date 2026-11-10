begin;

alter table public.audit_logs
  add column if not exists estate_id uuid references public.estates(id) on delete restrict,
  add column if not exists actor_role text,
  add column if not exists module text,
  add column if not exists page_path text,
  add column if not exists platform text,
  add column if not exists outcome text not null default 'success',
  add column if not exists severity text not null default 'info',
  add column if not exists changes jsonb not null default '{}'::jsonb;

create index if not exists audit_logs_estate_created_idx
  on public.audit_logs (estate_id, created_at desc);
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_module_created_idx
  on public.audit_logs (module, created_at desc);
create index if not exists audit_logs_severity_created_idx
  on public.audit_logs (severity, created_at desc);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid references public.estates(id) on delete restrict,
  audit_log_id uuid not null references public.audit_logs(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete restrict,
  alert_type text not null,
  severity text not null check (severity in ('warning', 'critical')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'acknowledged')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_by uuid references public.users(id) on delete restrict,
  acknowledged_at timestamptz,
  check ((status = 'new' and acknowledged_by is null and acknowledged_at is null)
      or (status = 'acknowledged' and acknowledged_by is not null and acknowledged_at is not null))
);

create index if not exists admin_alerts_estate_created_idx
  on public.admin_alerts (estate_id, created_at desc);
create index if not exists admin_alerts_status_created_idx
  on public.admin_alerts (status, severity, created_at desc);

alter table public.audit_logs enable row level security;
alter table public.admin_alerts enable row level security;

drop policy if exists audit_logs_admin_scope_read on public.audit_logs;
create policy audit_logs_admin_scope_read
on public.audit_logs for select to authenticated
using (
  exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'platform_admin'
  )
  or (
    estate_id is not null and exists (
      select 1 from public.estate_memberships m
      where m.user_id = (select auth.uid())
        and m.estate_id = audit_logs.estate_id
        and m.status = 'active'
        and m.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
    )
  )
);

drop policy if exists admin_alerts_admin_scope_read on public.admin_alerts;
create policy admin_alerts_admin_scope_read
on public.admin_alerts for select to authenticated
using (
  exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'platform_admin'
  )
  or (
    estate_id is not null and exists (
      select 1 from public.estate_memberships m
      where m.user_id = (select auth.uid())
        and m.estate_id = admin_alerts.estate_id
        and m.status = 'active'
        and m.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
    )
  )
);

drop policy if exists admin_alerts_admin_acknowledge on public.admin_alerts;
create policy admin_alerts_admin_acknowledge
on public.admin_alerts for update to authenticated
using (
  status = 'new' and (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'platform_admin'
    )
    or (
      estate_id is not null and exists (
        select 1 from public.estate_memberships m
        where m.user_id = (select auth.uid())
          and m.estate_id = admin_alerts.estate_id
          and m.status = 'active'
          and m.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
      )
    )
  )
)
with check (
  status = 'acknowledged'
  and acknowledged_by = (select auth.uid())
  and acknowledged_at is not null
  and (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'platform_admin'
    )
    or (
      estate_id is not null and exists (
        select 1 from public.estate_memberships m
        where m.user_id = (select auth.uid())
          and m.estate_id = admin_alerts.estate_id
          and m.status = 'active'
          and m.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
      )
    )
  )
);

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke all on public.admin_alerts from anon, authenticated;
grant select on public.admin_alerts to authenticated;
grant update (status, acknowledged_by, acknowledged_at) on public.admin_alerts to authenticated;

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs_are_append_only' using errcode = '42501';
end;
$$;
revoke all on function private.prevent_audit_log_mutation() from public, anon, authenticated;
drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function private.prevent_audit_log_mutation();

create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_row jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
  v_actor_role text := 'system';
  v_estate_id uuid;
  v_resource_id uuid;
  v_action text := lower(tg_op);
  v_module text := 'Platform';
  v_headers jsonb := '{}'::jsonb;
  v_user_agent text;
  v_referer text;
  v_page_path text;
  v_platform text := 'server';
  v_ip_text text;
  v_ip inet;
  v_request_id text;
  v_changes jsonb := '{}'::jsonb;
  v_audit_id uuid;
  v_severity text := 'info';
  v_alert_title text;
  v_alert_message text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_row := v_old;
  else
    v_new := to_jsonb(new);
    v_row := v_new;
    if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
  end if;

  v_resource_id := coalesce(nullif(v_row ->> 'id', '')::uuid, nullif(v_row ->> 'user_id', '')::uuid);
  if tg_table_name = 'estates' then
    v_estate_id := nullif(v_row ->> 'id', '')::uuid;
  else
    v_estate_id := nullif(v_row ->> 'estate_id', '')::uuid;
  end if;

  if v_actor is not null then
    select r.role::text into v_actor_role
    from public.user_roles r
    where r.user_id = v_actor and r.role = 'platform_admin'
    limit 1;
    if v_actor_role is null then
      select m.membership_role into v_actor_role
      from public.estate_memberships m
      where m.user_id = v_actor
        and m.status = 'active'
        and (v_estate_id is null or m.estate_id = v_estate_id)
      order by case when m.membership_role in ('facility_manager','estate_manager','estate_admin') then 0 else 1 end
      limit 1;
    end if;
    v_actor_role := coalesce(v_actor_role, 'authenticated_user');
  end if;

  v_module := case
    when tg_table_name in ('users','user_roles','estate_memberships') then 'User Management'
    when tg_table_name in ('estates','buildings','units','resident_units') then 'Estate & Property Management'
    when tg_table_name in ('visitor_passes','visitor_visits') then 'Visitor Management'
    when tg_table_name in ('estate_events','estate_event_guests','estate_event_invitations','estate_event_checkins') then 'Events'
    when tg_table_name in ('estate_service_charges','service_charge_payments','payment_intents') then 'Payments & Service Charges'
    when tg_table_name in ('electricity_recharge_orders','resident_electricity_meters') then 'Electricity'
    when tg_table_name = 'maintenance_requests' then 'Maintenance'
    when tg_table_name = 'announcements' then 'Communications'
    else 'Platform'
  end;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_user_agent := nullif(v_headers ->> 'user-agent', '');
  v_referer := nullif(v_headers ->> 'referer', '');
  v_page_path := nullif(substring(v_referer from 'https?://[^/]+([^?#]*)'), '');
  v_ip_text := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), '');
  begin
    if v_ip_text is not null then v_ip := btrim(v_ip_text)::inet; end if;
  exception when others then
    v_ip := null;
  end;
  v_request_id := coalesce(nullif(v_headers ->> 'x-request-id', ''), nullif(current_setting('request.id', true), ''));
  v_platform := coalesce(nullif(v_headers ->> 'x-cb-platform', ''),
    case when coalesce(v_user_agent, '') ~* '(android|iphone|ipad|mobile)' then 'mobile'
         when v_user_agent is not null then 'web' else 'server' end);

  select coalesce(jsonb_object_agg(changed.key, jsonb_build_object(
    'before', case when changed.key ~* '(password|token|secret|hash|phone|email|address|visitor_name|full_name|account|meter_number|code|reference|description|body|notes)'
      then to_jsonb('[REDACTED]'::text) else coalesce(v_old -> changed.key, 'null'::jsonb) end,
    'after', case when changed.key ~* '(password|token|secret|hash|phone|email|address|visitor_name|full_name|account|meter_number|code|reference|description|body|notes)'
      then to_jsonb('[REDACTED]'::text) else coalesce(v_new -> changed.key, 'null'::jsonb) end
  )), '{}'::jsonb)
  into v_changes
  from (
    select key from jsonb_object_keys(v_old) as old_keys(key)
    union
    select key from jsonb_object_keys(v_new) as new_keys(key)
  ) changed
  where v_old -> changed.key is distinct from v_new -> changed.key;

  if tg_table_name in ('user_roles','estate_memberships') then
    v_severity := 'warning';
  elsif tg_table_name = 'estates' and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and v_new ->> 'is_enabled' = 'false')) then
    v_severity := 'critical';
  elsif tg_op = 'DELETE' then
    v_severity := 'warning';
  elsif tg_table_name in ('payment_intents','service_charge_payments','electricity_recharge_orders')
    and coalesce(v_new ->> 'status', '') in ('failed','reversed','disputed') then
    v_severity := 'warning';
  end if;

  insert into public.audit_logs (
    actor_user_id, action, resource_type, resource_id, request_id, ip_address,
    user_agent, metadata, estate_id, actor_role, module, page_path, platform,
    outcome, severity, changes
  ) values (
    v_actor, v_action, tg_table_name, v_resource_id, v_request_id, v_ip,
    v_user_agent,
    jsonb_build_object('schema', tg_table_schema, 'source', 'database_trigger'),
    v_estate_id, v_actor_role, v_module, v_page_path, v_platform,
    'success', v_severity, v_changes
  ) returning id into v_audit_id;

  if v_severity in ('warning','critical') then
    v_alert_title := case
      when tg_table_name in ('user_roles','estate_memberships') then 'User access or role changed'
      when tg_table_name = 'estates' then 'Estate status or record changed'
      when tg_table_name in ('payment_intents','service_charge_payments') then 'Payment requires attention'
      when tg_table_name = 'electricity_recharge_orders' then 'Electricity transaction failed'
      else 'Administrative record deleted'
    end;
    v_alert_message := format('%s action on %s (%s).', upper(v_action), tg_table_name, coalesce(v_actor_role, 'system'));
    insert into public.admin_alerts (
      estate_id, audit_log_id, actor_user_id, alert_type, severity, title, message, metadata
    ) values (
      v_estate_id, v_audit_id, v_actor, tg_table_name, v_severity, v_alert_title, v_alert_message,
      jsonb_build_object('resource_id', v_resource_id, 'module', v_module, 'page_path', v_page_path, 'platform', v_platform)
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_admin_change() from public, anon, authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'users','user_roles','estates','estate_memberships','buildings','units','resident_units',
    'announcements','maintenance_requests','visitor_passes','visitor_visits',
    'estate_service_charges','service_charge_payments','payment_intents',
    'electricity_recharge_orders','estate_events','estate_event_guests',
    'estate_event_invitations','estate_event_checkins','resident_electricity_meters',
    'resident_virtual_accounts'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists audit_admin_change on public.%I', v_table);
      execute format(
        'create trigger audit_admin_change after insert or update or delete on public.%I for each row execute function private.audit_admin_change()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function public.acknowledge_admin_alert(p_alert_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  update public.admin_alerts
  set status = 'acknowledged',
      acknowledged_by = auth.uid(),
      acknowledged_at = now()
  where id = p_alert_id and status = 'new'
  returning id into v_id;
  if v_id is null then
    raise exception 'alert_not_found_or_already_acknowledged' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;
revoke all on function public.acknowledge_admin_alert(uuid) from public, anon;
grant execute on function public.acknowledge_admin_alert(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_alerts'
     ) then
    execute 'alter publication supabase_realtime add table public.admin_alerts';
  end if;
end;
$$;

commit;