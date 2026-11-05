-- Attribute service-role onboarding writes to the authenticated admin and stream audit changes live.
begin;
create or replace function private.fill_audit_actor()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_claims jsonb:='{}'::jsonb; v_headers jsonb:='{}'::jsonb; v_actor uuid; v_role text;
begin
 if new.actor_user_id is not null then return new; end if;
 begin
  v_claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
  v_headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 exception when others then return new; end;
 if v_claims->>'role'<>'service_role' then return new; end if;
 begin v_actor:=nullif(v_headers->>'x-cb-actor-id','')::uuid;
 exception when others then v_actor:=null; end;
 if v_actor is null then return new; end if;
 new.actor_user_id:=v_actor;
 select r.role::text into v_role from public.user_roles r
  where r.user_id=v_actor and r.role='platform_admin' limit 1;
 if v_role is null and new.estate_id is not null then
  select m.membership_role into v_role from public.estate_memberships m
   where m.user_id=v_actor and m.estate_id=new.estate_id and m.status='active'
   order by case when m.membership_role in ('facility_manager','estate_manager','estate_admin') then 0 else 1 end limit 1;
 end if;
 new.actor_role:=coalesce(v_role,'authenticated_user');
 return new;
end;
$$;
revoke all on function private.fill_audit_actor() from public,anon,authenticated;
drop trigger if exists audit_logs_fill_actor on public.audit_logs;
create trigger audit_logs_fill_actor before insert on public.audit_logs
for each row execute function private.fill_audit_actor();
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audit_logs') then
  execute 'alter publication supabase_realtime add table public.audit_logs';
 end if;
end;
$$;
commit;
