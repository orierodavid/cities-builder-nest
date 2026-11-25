DO $migration$
DECLARE
  target record;
  definition text;
  old_guard text := $old$IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN$old$;
  new_guard text := 'IF actor_id IS NULL THEN';
  updated_count integer := 0;
BEGIN
  FOR target IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'get_my_resident_identity',
        'get_my_household_members',
        'create_resident_household_invite',
        'accept_resident_household_invite',
        'remove_resident_household_member',
        'cancel_resident_household_invite'
      )
  LOOP
    definition := pg_get_functiondef(target.oid);
    IF position(old_guard IN definition) = 0 THEN
      RAISE EXCEPTION 'Expected legacy JWT role guard not found in %.%', target.nspname, target.proname;
    END IF;
    definition := replace(definition, old_guard, new_guard);
    EXECUTE definition;
    updated_count := updated_count + 1;
  END LOOP;
  IF updated_count <> 6 THEN
    RAISE EXCEPTION 'Expected to update 6 resident functions, updated %', updated_count;
  END IF;
END;
$migration$;
