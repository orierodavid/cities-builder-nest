begin;

-- SECURITY DEFINER RPCs bypass table RLS. Add a central account-state check
-- to every authenticated-callable PL/pgSQL SECURITY DEFINER function so a
-- disabled account cannot continue using privileged RPC endpoints.
do $account_guard$
declare
  v_function record;
  v_definition text;
  v_after_marker text;
  v_marker integer;
  v_begin_relative integer;
  v_insert_position integer;
begin
  for v_function in
    select p.oid, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.prosecdef = true
      and l.lanname = 'plpgsql'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    if position('private.is_account_access_enabled' in v_function.prosrc) > 0 then
      continue;
    end if;

    v_definition := pg_get_functiondef(v_function.oid);
    v_marker := strpos(v_definition, '$function$');
    if v_marker = 0 then
      raise exception 'Could not locate function body for %', v_function.oid;
    end if;

    v_after_marker := substring(v_definition from v_marker + length('$function$'));
    v_begin_relative := strpos(lower(v_after_marker), E'\nbegin');
    if v_begin_relative = 0 then
      raise exception 'Could not locate PL/pgSQL BEGIN for %', v_function.oid;
    end if;

    v_insert_position := v_marker + length('$function$') + v_begin_relative + length(E'\nbegin') - 1;
    v_definition :=
      substring(v_definition from 1 for v_insert_position)
      || E'\n  IF auth.uid() IS NOT NULL AND NOT private.is_account_access_enabled() THEN\n    RAISE EXCEPTION ''account_disabled'' USING ERRCODE = ''42501'';\n  END IF;\n'
      || substring(v_definition from v_insert_position + 1);

    execute v_definition;
  end loop;
end;
$account_guard$;

-- The one authenticated-callable SECURITY DEFINER SQL function receives the
-- same guard in its query predicate.
do $sql_guard$
declare
  v_function record;
  v_definition text;
  v_old text := 'and (private.is_platform_admin() or private.is_active_estate_manager(target_estate_id));';
  v_new text := 'and (auth.uid() is null or private.is_account_access_enabled()) and (private.is_platform_admin() or private.is_active_estate_manager(target_estate_id));';
begin
  for v_function in
    select p.oid, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.proname = 'get_active_resident_candidate'
      and p.prosecdef = true
      and l.lanname = 'sql'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    if position('private.is_account_access_enabled' in v_function.prosrc) > 0 then
      continue;
    end if;
    v_definition := replace(pg_get_functiondef(v_function.oid), v_old, v_new);
    if v_definition = pg_get_functiondef(v_function.oid) then
      raise exception 'Could not add account guard to get_active_resident_candidate';
    end if;
    execute v_definition;
  end loop;
end;
$sql_guard$;

commit;