BEGIN;
CREATE OR REPLACE FUNCTION public.management_assign_resident_apartment(
  p_estate_id uuid,
  p_resident_user_id uuid,
  p_building_name text,
  p_unit_code text,
  p_unit_type text DEFAULT NULL
)
RETURNS TABLE(unit_id uuid, building_id uuid, apartment_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  building_value text := btrim(coalesce(p_building_name, ''));
  unit_value text := btrim(coalesce(p_unit_code, ''));
  building_row public.buildings%ROWTYPE;
  unit_row public.units%ROWTYPE;
  resident_count integer;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF NOT private.is_account_access_enabled() THEN RAISE EXCEPTION 'account_access_required' USING ERRCODE='42501'; END IF;
  IF NOT private.is_platform_admin() AND NOT private.is_active_estate_manager(p_estate_id) THEN
    RAISE EXCEPTION 'estate_management_required' USING ERRCODE='42501';
  END IF;
  IF length(building_value) NOT BETWEEN 1 AND 120 OR length(unit_value) NOT BETWEEN 1 AND 80
     OR (p_unit_type IS NOT NULL AND length(btrim(p_unit_type)) > 80) THEN
    RAISE EXCEPTION 'valid_building_and_apartment_details_required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estate_memberships em WHERE em.estate_id=p_estate_id
    AND em.user_id=p_resident_user_id AND em.membership_role='resident' AND em.status='active') THEN
    RAISE EXCEPTION 'active_resident_not_found_in_estate' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resident_units ru WHERE ru.resident_user_id=p_resident_user_id
    AND ru.end_date IS NULL AND ru.estate_id<>p_estate_id) THEN
    RAISE EXCEPTION 'resident_already_assigned_to_another_estate_apartment' USING ERRCODE='23505';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_estate_id::text || ':' || lower(building_value) || ':' || lower(unit_value), 0));
  SELECT b.* INTO building_row FROM public.buildings b
    WHERE b.estate_id=p_estate_id AND lower(b.name)=lower(building_value)
    ORDER BY b.created_at ASC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.buildings(estate_id,name) VALUES(p_estate_id,building_value) RETURNING * INTO building_row;
  END IF;
  SELECT u.* INTO unit_row FROM public.units u
    WHERE u.estate_id=p_estate_id AND u.building_id=building_row.id AND lower(u.unit_code)=lower(unit_value)
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.units(estate_id,building_id,unit_code,unit_type,status)
    VALUES(p_estate_id,building_row.id,unit_value,nullif(btrim(coalesce(p_unit_type,'')),''),'available')
    RETURNING * INTO unit_row;
  END IF;
  IF EXISTS (SELECT 1 FROM public.resident_units ru WHERE ru.resident_user_id=p_resident_user_id
    AND ru.end_date IS NULL AND ru.unit_id<>unit_row.id) THEN
    RAISE EXCEPTION 'resident_already_assigned_to_another_apartment' USING ERRCODE='23505';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(unit_row.id::text, 0));
  SELECT count(*) INTO resident_count FROM public.resident_units ru
    WHERE ru.unit_id=unit_row.id AND ru.end_date IS NULL AND ru.resident_user_id<>p_resident_user_id;
  IF resident_count >= 2 THEN RAISE EXCEPTION 'apartment_resident_limit_reached' USING ERRCODE='23505'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resident_units ru WHERE ru.unit_id=unit_row.id
    AND ru.resident_user_id=p_resident_user_id AND ru.end_date IS NULL) THEN
    INSERT INTO public.resident_units(estate_id,unit_id,resident_user_id,start_date)
    VALUES(p_estate_id,unit_row.id,p_resident_user_id,current_date);
  END IF;
  UPDATE public.units SET status='occupied' WHERE id=unit_row.id;
  RETURN QUERY SELECT unit_row.id,building_row.id,unit_row.unit_code;
END;
$function$;
REVOKE ALL ON FUNCTION public.management_assign_resident_apartment(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_assign_resident_apartment(uuid,uuid,text,text,text) TO authenticated;
COMMIT;
