revoke all on function public.mark_maintenance_response_read(uuid) from public, anon;
grant execute on function public.mark_maintenance_response_read(uuid) to authenticated;
revoke all on function public.respond_to_maintenance_request(uuid,text,boolean) from public, anon;
grant execute on function public.respond_to_maintenance_request(uuid,text,boolean) to authenticated;
revoke all on function public.notify_maintenance_request_created() from public, anon, authenticated;