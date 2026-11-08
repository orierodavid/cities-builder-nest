-- Two-way maintenance updates with independent unread tracking for residents and management.
begin;

alter table public.maintenance_requests
  add column if not exists management_response text,
  add column if not exists responded_by uuid references auth.users(id) on delete set null,
  add column if not exists responded_at timestamptz,
  add column if not exists resident_response_read_at timestamptz;

alter table public.resident_notifications
  add column if not exists maintenance_request_id uuid references public.maintenance_requests(id) on delete cascade;

create table if not exists public.maintenance_management_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('new_request','request_updated')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id, recipient_user_id, notification_type)
);
alter table public.maintenance_management_notifications enable row level security;
drop policy if exists maintenance_management_notifications_read_own on public.maintenance_management_notifications;
create policy maintenance_management_notifications_read_own
on public.maintenance_management_notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));
drop policy if exists maintenance_management_notifications_mark_own on public.maintenance_management_notifications;
create policy maintenance_management_notifications_mark_own
on public.maintenance_management_notifications for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()) and read_at is not null);
grant select, update on public.maintenance_management_notifications to authenticated;

create or replace function public.notify_maintenance_request_created()
returns trigger language plpgsql security definer set search_path = public, private, auth
as $$
begin
  insert into public.maintenance_management_notifications(request_id, recipient_user_id, notification_type)
  select new.id, ur.user_id, 'new_request'
  from public.user_roles ur where ur.role = 'platform_admin'
  on conflict do nothing;

  insert into public.maintenance_management_notifications(request_id, recipient_user_id, notification_type)
  select new.id, em.user_id, 'new_request'
  from public.estate_memberships em
  where em.estate_id = new.estate_id and em.status = 'active'
    and em.membership_role in ('facility_manager','estate_manager','estate_admin')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists maintenance_request_created_notify_management on public.maintenance_requests;
create trigger maintenance_request_created_notify_management
after insert on public.maintenance_requests
for each row execute function public.notify_maintenance_request_created();

create or replace function public.respond_to_maintenance_request(
  p_request_id uuid, p_response text, p_mark_fixed boolean default false
) returns void
language plpgsql security definer set search_path = public, private, auth
as $$
declare
  v_request public.maintenance_requests%rowtype;
  v_actor uuid := auth.uid();
  v_role text;
  v_notification_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_response,''))) < 2 or length(p_response) > 4000 then
    raise exception 'Please enter a response between 2 and 4000 characters';
  end if;
  select * into v_request from public.maintenance_requests where id = p_request_id for update;
  if not found then raise exception 'Maintenance request not found'; end if;
  if not (private.is_platform_admin() or private.is_active_estate_manager(v_request.estate_id)) then
    raise exception 'You are not authorised to respond to this maintenance request';
  end if;
  select case when private.is_platform_admin() then 'platform_admin' else 'facility_manager' end into v_role;

  update public.maintenance_requests
  set management_response = trim(p_response),
      responded_by = v_actor,
      responded_at = now(),
      resident_response_read_at = null,
      status = case when p_mark_fixed then 'resolved' else 'in_progress' end,
      updated_at = now()
  where id = p_request_id;

  insert into public.resident_notifications(title, body, priority, sent_by, sent_by_role, maintenance_request_id)
  values (
    case when p_mark_fixed then 'Maintenance request fixed' else 'Maintenance request update' end,
    v_request.title || ': ' || trim(p_response),
    case when p_mark_fixed then 'important' else 'normal' end,
    v_actor, v_role, p_request_id
  ) returning id into v_notification_id;

  insert into public.resident_notification_recipients(notification_id, recipient_user_id, estate_id)
  values (v_notification_id, v_request.created_by, v_request.estate_id);
end;
$$;
revoke all on function public.respond_to_maintenance_request(uuid,text,boolean) from public;
grant execute on function public.respond_to_maintenance_request(uuid,text,boolean) to authenticated;

create or replace function public.mark_maintenance_response_read(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  update public.maintenance_requests
  set resident_response_read_at = now()
  where id = p_request_id and created_by = auth.uid()
    and management_response is not null and resident_response_read_at is null;

  update public.resident_notification_recipients r set read_at = now()
  from public.resident_notifications n
  where n.id = r.notification_id and n.maintenance_request_id = p_request_id
    and r.recipient_user_id = auth.uid() and r.read_at is null;
end;
$$;
revoke all on function public.mark_maintenance_response_read(uuid) from public;
grant execute on function public.mark_maintenance_response_read(uuid) to authenticated;

commit;
