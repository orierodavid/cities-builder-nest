-- Enforce current legal acceptance for every authenticated client at the database boundary.
-- The UI gate is helpful UX, but RLS is the security boundary that prevents API bypass.
-- SECURITY DEFINER consent RPCs remain usable so users can read and accept the required documents.
do $$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  loop
    execute format(
      'drop policy if exists require_current_legal_consent on public.%I',
      v_table.relname
    );
    execute format(
      'create policy require_current_legal_consent on public.%I as restrictive for all to authenticated using (public.current_user_has_required_legal_consent()) with check (public.current_user_has_required_legal_consent())',
      v_table.relname
    );
  end loop;
end;
$$;
