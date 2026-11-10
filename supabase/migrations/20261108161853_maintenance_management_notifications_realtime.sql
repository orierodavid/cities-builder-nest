do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='maintenance_management_notifications') then
  alter publication supabase_realtime add table public.maintenance_management_notifications;
 end if;
end $$;