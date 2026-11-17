begin;

-- Audit records are immutable historical records. Keep their original estate UUID
-- even after an empty duplicate estate is removed.
alter table public.audit_logs
  drop constraint if exists audit_logs_estate_id_fkey;

-- A delete audit entry is still written, but do not create a live admin alert
-- for an estate row that is being deleted in the same transaction.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'audit_admin_change'
     and pg_get_function_identity_arguments(p.oid) = '';

  if v_definition is null then
    raise exception 'Expected private.audit_admin_change() trigger function';
  end if;

  if position('if v_severity in (''warning'',''critical'') then' in v_definition) = 0 then
    raise exception 'Unexpected audit function definition; refusing to patch';
  end if;

  v_definition := replace(
    v_definition,
    'if v_severity in (''warning'',''critical'') then',
    'if v_severity in (''warning'',''critical'') and not (tg_table_name = ''estates'' and tg_op = ''DELETE'') then'
  );
  execute v_definition;
end;
$$;

-- Retain one estate for each normalized name/state/LGA identity. Remove only
-- duplicate rows with no linked operational data; abort if a duplicate has
-- residents, financial records, visits, maintenance, or other linked records.
do $$
declare
  v_group record;
  v_duplicate record;
  v_keep_id uuid;
  v_table record;
  v_count bigint;
  v_deleted integer;
begin
  for v_group in
    select
      lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name,
      lower(btrim(state)) as normalized_state,
      lower(btrim(coalesce(lga, city, ''))) as normalized_lga
    from public.estates
    group by 1, 2, 3
    having count(*) > 1
  loop
    select e.id
      into v_keep_id
      from public.estates e
     where lower(regexp_replace(btrim(e.name), '\s+', ' ', 'g')) = v_group.normalized_name
       and lower(btrim(e.state)) = v_group.normalized_state
       and lower(btrim(coalesce(e.lga, e.city, ''))) = v_group.normalized_lga
     order by
       (select count(*) from public.estate_memberships m where m.estate_id = e.id) desc,
       e.created_at asc,
       e.id asc
     limit 1
     for update;

    for v_duplicate in
      select e.id
        from public.estates e
       where lower(regexp_replace(btrim(e.name), '\s+', ' ', 'g')) = v_group.normalized_name
         and lower(btrim(e.state)) = v_group.normalized_state
         and lower(btrim(coalesce(e.lga, e.city, ''))) = v_group.normalized_lga
         and e.id <> v_keep_id
       order by e.created_at desc
       for update
    loop
      for v_table in
        select distinct table_name
          from information_schema.columns
         where table_schema = 'public'
           and column_name = 'estate_id'
           and table_name <> 'audit_logs'
      loop
        execute format('select count(*) from public.%I where estate_id = $1', v_table.table_name)
          into v_count using v_duplicate.id;
        if v_count > 0 then
          raise exception 'Cannot remove duplicate estate %: %.% still has % linked rows',
            v_duplicate.id, 'public', v_table.table_name, v_count;
        end if;
      end loop;

      delete from public.estates where id = v_duplicate.id;
      get diagnostics v_deleted = row_count;
      if v_deleted <> 1 then
        raise exception 'Expected to remove one empty duplicate estate %, removed %',
          v_duplicate.id, v_deleted;
      end if;
    end loop;
  end loop;
end;
$$;

create unique index if not exists estates_unique_name_state_lga_idx
  on public.estates (
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')),
    lower(btrim(state)),
    lower(btrim(coalesce(lga, city, '')))
  );

comment on column public.audit_logs.estate_id is
  'Immutable historical estate identifier. May intentionally reference a deleted estate so audit history remains intact.';

commit;
