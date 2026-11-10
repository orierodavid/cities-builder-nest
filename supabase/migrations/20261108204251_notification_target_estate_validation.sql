create or replace function public.send_resident_notification(
  p_title text,
  p_body text,
  p_estate_ids uuid[],
  p_priority text default 'normal'::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_is_platform_admin boolean := false;
  v_notification_id uuid;
  v_recipient_count integer := 0;
  v_sender_role text;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 10000
     or p_priority not in ('normal', 'important', 'urgent')
     or coalesce(cardinality(p_estate_ids), 0) = 0 then
    raise exception 'invalid_notification_input' using errcode = '22023';
  end if;
  if cardinality(p_estate_ids) <> (
    select count(distinct x.estate_id) from unnest(p_estate_ids) x(estate_id)
  ) then
    raise exception 'duplicate_or_null_estate_targets' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_estate_ids) requested(estate_id)
    where not exists (
      select 1 from public.estates e
      where e.id = requested.estate_id and e.is_enabled = true
    )
  ) then
    raise exception 'estate_target_unavailable' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_actor and ur.role = 'platform_admin'
  ) into v_is_platform_admin;
  if v_is_platform_admin then
    v_sender_role := 'platform_admin';
  else
    v_sender_role := 'facility_manager';
    if exists (
      select 1 from unnest(p_estate_ids) requested(estate_id)
      where not exists (
        select 1 from public.estate_memberships em
        where em.estate_id = requested.estate_id and em.user_id = v_actor
          and em.status = 'active'
          and em.membership_role in ('facility_manager', 'estate_manager', 'estate_admin')
      )
    ) then
      raise exception 'manager_cannot_send_to_unassigned_estate' using errcode = '42501';
    end if;
  end if;
  insert into public.resident_notifications(title, body, priority, sent_by, sent_by_role)
  values (btrim(p_title), btrim(p_body), p_priority, v_actor, v_sender_role)
  returning id into v_notification_id;
  insert into public.resident_notification_recipients(notification_id, recipient_user_id, estate_id)
  select v_notification_id, em.user_id, em.estate_id
  from public.estate_memberships em
  where em.estate_id = any(p_estate_ids)
    and em.membership_role = 'resident' and em.status = 'active'
  on conflict (notification_id, recipient_user_id) do nothing;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then
    delete from public.resident_notifications where id = v_notification_id;
    raise exception 'no_active_resident_recipients' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'notificationId', v_notification_id,
    'recipientCount', v_recipient_count,
    'priority', p_priority
  );
end;
$function$;