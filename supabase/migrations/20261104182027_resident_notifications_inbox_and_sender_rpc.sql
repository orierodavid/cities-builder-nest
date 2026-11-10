-- Resident notifications: durable per-recipient inbox, unread state, and secure sender RPC.
begin;
create table if not exists public.resident_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  sent_by uuid not null references auth.users(id) on delete restrict,
  sent_by_role text not null check (sent_by_role in ('platform_admin', 'facility_manager')),
  created_at timestamptz not null default now()
);
create table if not exists public.resident_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.resident_notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  estate_id uuid not null references public.estates(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, recipient_user_id)
);
create index if not exists resident_notification_recipients_inbox_idx on public.resident_notification_recipients(recipient_user_id, created_at desc);
create index if not exists resident_notification_recipients_unread_idx on public.resident_notification_recipients(recipient_user_id) where read_at is null;
create index if not exists resident_notifications_created_idx on public.resident_notifications(created_at desc);
alter table public.resident_notifications enable row level security;
alter table public.resident_notification_recipients enable row level security;
grant select on public.resident_notifications to authenticated;
grant select on public.resident_notification_recipients to authenticated;
grant update (read_at) on public.resident_notification_recipients to authenticated;
drop policy if exists "Recipients read notifications delivered to them" on public.resident_notifications;
create policy "Recipients read notifications delivered to them" on public.resident_notifications for select to authenticated
using (exists (select 1 from public.resident_notification_recipients r where r.notification_id = resident_notifications.id and r.recipient_user_id = (select auth.uid())));
drop policy if exists "Residents read their notification inbox" on public.resident_notification_recipients;
create policy "Residents read their notification inbox" on public.resident_notification_recipients for select to authenticated
using (recipient_user_id = (select auth.uid()));
drop policy if exists "Residents mark their notifications as read" on public.resident_notification_recipients;
create policy "Residents mark their notifications as read" on public.resident_notification_recipients for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()) and read_at is not null);
create or replace function public.send_resident_notification(p_title text, p_body text, p_estate_ids uuid[], p_priority text default 'normal')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_is_platform_admin boolean := false;
  v_notification_id uuid;
  v_recipient_count integer := 0;
  v_sender_role text;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 10000
     or p_priority not in ('normal', 'important', 'urgent')
     or coalesce(cardinality(p_estate_ids), 0) = 0 then
    raise exception 'invalid_notification_input' using errcode = '22023';
  end if;
  if cardinality(p_estate_ids) <> (select count(distinct x.estate_id) from unnest(p_estate_ids) x(estate_id)) then
    raise exception 'duplicate_estate_targets' using errcode = '22023';
  end if;
  select exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = 'platform_admin') into v_is_platform_admin;
  if v_is_platform_admin then
    v_sender_role := 'platform_admin';
  else
    v_sender_role := 'facility_manager';
    if exists (
      select 1 from unnest(p_estate_ids) requested(estate_id)
      where not exists (
        select 1 from public.estate_memberships em
        where em.estate_id = requested.estate_id and em.user_id = v_actor and em.status = 'active'
          and em.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
      )
    ) then raise exception 'manager_cannot_send_to_unassigned_estate' using errcode = '42501'; end if;
  end if;
  insert into public.resident_notifications(title, body, priority, sent_by, sent_by_role)
  values (btrim(p_title), btrim(p_body), p_priority, v_actor, v_sender_role)
  returning id into v_notification_id;
  insert into public.resident_notification_recipients(notification_id, recipient_user_id, estate_id)
  select v_notification_id, em.user_id, em.estate_id from public.estate_memberships em
  where em.estate_id = any(p_estate_ids) and em.membership_role = 'resident' and em.status = 'active'
  on conflict (notification_id, recipient_user_id) do nothing;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then
    delete from public.resident_notifications where id = v_notification_id;
    raise exception 'no_active_resident_recipients' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('notificationId', v_notification_id, 'recipientCount', v_recipient_count, 'priority', p_priority);
end;
$$;
revoke all on function public.send_resident_notification(text, text, uuid[], text) from public, anon;
grant execute on function public.send_resident_notification(text, text, uuid[], text) to authenticated;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'resident_notification_recipients') then
    execute 'alter publication supabase_realtime add table public.resident_notification_recipients';
  end if;
end;
$$;
commit;
