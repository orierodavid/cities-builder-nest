begin;

alter table public.maintenance_requests
  add column if not exists resident_reopen_note text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_count integer not null default 0;

alter table public.maintenance_management_notifications
  drop constraint if exists maintenance_management_notifications_request_id_recipient_user_id_notification_type_key;
create index if not exists maintenance_management_notifications_unread_idx
  on public.maintenance_management_notifications(recipient_user_id, created_at desc)
  where read_at is null;

create or replace function public.reopen_maintenance_request(
  p_request_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_request public.maintenance_requests%rowtype;
  v_notification_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_reason, ''))) > 2000 then
    raise exception 'The explanation must be 2000 characters or fewer';
  end if;
  select * into v_request from public.maintenance_requests where id = p_request_id for update;
  if not found then raise exception 'Maintenance request not found'; end if;
  if v_request.created_by <> auth.uid() then
    raise exception 'You can only reopen your own maintenance requests';
  end if;
  if v_request.status not in ('resolved', 'closed') then
    raise exception 'Only a fixed or closed request can be reopened';
  end if;

  update public.maintenance_requests
  set status = 'open',
      resident_reopen_note = nullif(trim(coalesce(p_reason, '')), ''),
      reopened_at = now(),
      reopen_count = coalesce(reopen_count, 0) + 1,
      resident_response_read_at = null,
      updated_at = now()
  where id = p_request_id;

  insert into public.maintenance_management_notifications(request_id, recipient_user_id, notification_type)
  select p_request_id, ur.user_id, 'request_updated' from public.user_roles ur
  where ur.role = 'platform_admin';

  insert into public.maintenance_management_notifications(request_id, recipient_user_id, notification_type)
  select p_request_id, em.user_id, 'request_updated' from public.estate_memberships em
  where em.estate_id = v_request.estate_id and em.status = 'active'
    and em.membership_role in ('facility_manager','estate_manager','estate_admin');

  insert into public.resident_notifications(title, body, priority, sent_by, sent_by_role, maintenance_request_id)
  values (
    'Maintenance request reopened',
    v_request.title || ': The resident has reopened this request.' ||
      case when nullif(trim(coalesce(p_reason, '')), '') is not null then ' ' || trim(p_reason) else '' end,
    'important', auth.uid(), 'resident', p_request_id
  ) returning id into v_notification_id;

  insert into public.resident_notification_recipients(notification_id, recipient_user_id, estate_id)
  values (v_notification_id, v_request.created_by, v_request.estate_id);
end;
$$;
revoke all on function public.reopen_maintenance_request(uuid,text) from public;
grant execute on function public.reopen_maintenance_request(uuid,text) to authenticated;

commit;