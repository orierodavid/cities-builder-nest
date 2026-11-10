
create or replace function public.mark_maintenance_response_read(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
 update public.maintenance_requests
 set resident_response_read_at=now()
 where id=p_request_id and created_by=auth.uid() and management_response is not null
   and resident_response_read_at is null;
end;
$$;
revoke all on function public.mark_maintenance_response_read(uuid) from public;
grant execute on function public.mark_maintenance_response_read(uuid) to authenticated;
