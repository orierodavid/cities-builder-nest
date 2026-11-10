
alter table public.resident_notifications add column if not exists maintenance_request_id uuid references public.maintenance_requests(id) on delete cascade;
create or replace function public.respond_to_maintenance_request(
 p_request_id uuid,p_response text,p_mark_fixed boolean default false
) returns void language plpgsql security definer set search_path=public,private,auth
as $$
declare v_request public.maintenance_requests%rowtype; v_actor uuid:=auth.uid(); v_role text; v_notification_id uuid;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if length(trim(coalesce(p_response,'')))<2 or length(p_response)>4000 then raise exception 'Please enter a response between 2 and 4000 characters'; end if;
 select * into v_request from public.maintenance_requests where id=p_request_id for update;
 if not found then raise exception 'Maintenance request not found'; end if;
 if not (private.is_platform_admin() or private.is_active_estate_manager(v_request.estate_id)) then raise exception 'You are not authorised to respond to this maintenance request'; end if;
 select case when private.is_platform_admin() then 'platform_admin' else 'facility_manager' end into v_role;
 update public.maintenance_requests set management_response=trim(p_response),responded_by=v_actor,responded_at=now(),resident_response_read_at=null,status=case when p_mark_fixed then 'resolved' else 'in_progress' end,updated_at=now() where id=p_request_id;
 insert into public.resident_notifications(title,body,priority,sent_by,sent_by_role,maintenance_request_id)
 values(case when p_mark_fixed then 'Maintenance request fixed' else 'Maintenance request update' end,v_request.title||': '||trim(p_response),case when p_mark_fixed then 'important' else 'normal' end,v_actor,v_role,p_request_id)
 returning id into v_notification_id;
 insert into public.resident_notification_recipients(notification_id,recipient_user_id,estate_id) values(v_notification_id,v_request.created_by,v_request.estate_id);
end;
$$;
create or replace function public.mark_maintenance_response_read(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
 update public.maintenance_requests set resident_response_read_at=now()
 where id=p_request_id and created_by=auth.uid() and management_response is not null and resident_response_read_at is null;
 update public.resident_notification_recipients r set read_at=now()
 from public.resident_notifications n
 where n.id=r.notification_id and n.maintenance_request_id=p_request_id
 and r.recipient_user_id=auth.uid() and r.read_at is null;
end;
$$;
revoke all on function public.respond_to_maintenance_request(uuid,text,boolean) from public;
grant execute on function public.respond_to_maintenance_request(uuid,text,boolean) to authenticated;
revoke all on function public.mark_maintenance_response_read(uuid) from public;
grant execute on function public.mark_maintenance_response_read(uuid) to authenticated;
