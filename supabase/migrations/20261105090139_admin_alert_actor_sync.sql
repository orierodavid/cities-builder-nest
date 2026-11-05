-- Copy the attributed audit actor onto alert records created by audit triggers.
begin;
create or replace function private.fill_admin_alert_actor()
returns trigger language plpgsql set search_path='' as $$
declare v_actor uuid; v_role text;
begin
 select a.actor_user_id,a.actor_role into v_actor,v_role
 from public.audit_logs a where a.id=new.audit_log_id;
 new.actor_user_id:=coalesce(new.actor_user_id,v_actor);
 if v_role is not null then
  new.message:=replace(new.message,'(system).','('||v_role||').');
 end if;
 return new;
end;
$$;
revoke all on function private.fill_admin_alert_actor() from public,anon,authenticated;
drop trigger if exists admin_alerts_fill_actor on public.admin_alerts;
create trigger admin_alerts_fill_actor before insert on public.admin_alerts
for each row execute function private.fill_admin_alert_actor();
commit;
