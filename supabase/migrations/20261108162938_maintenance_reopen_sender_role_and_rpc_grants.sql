alter table public.resident_notifications
  drop constraint if exists resident_notifications_sent_by_role_check;
alter table public.resident_notifications
  add constraint resident_notifications_sent_by_role_check
  check (sent_by_role = any (array['platform_admin'::text,'facility_manager'::text,'security'::text,'resident'::text]));
revoke all on function public.reopen_maintenance_request(uuid,text) from public, anon;
grant execute on function public.reopen_maintenance_request(uuid,text) to authenticated;