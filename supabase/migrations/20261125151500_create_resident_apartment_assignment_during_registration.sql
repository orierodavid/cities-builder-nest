CREATE OR REPLACE FUNCTION public.register_resident_apartment(
  p_estate_id uuid,
  p_resident_user_id uuid,
  p_building_name text,
  p_unit_code text
)
RETURNS TABLE(unit_id uuid, building_id uuid, apartment_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  building_value text := btrim(coalesce(p_building_name, ''));
  unit_value text := btrim(coalesce(p_unit_code, ''));
  building_row public.buildings%ROWTYPE;
  unit_row public.units%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_estate_id IS NULL OR p_resident_user_id IS NULL
     OR length(building_value) NOT BETWEEN 1 AND 120
     OR length(unit_value) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'valid_estate_building_and_apartment_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.estates e
    JOIN public.estate_memberships em ON em.estate_id = e.id
    JOIN public.users u ON u.id = em.user_id
    WHERE e.id = p_estate_id
      AND e.is_enabled = true
      AND em.user_id = p_resident_user_id
      AND em.membership_role = 'resident'
      AND em.status IN ('invited', 'active')
      AND u.deleted_at IS NULL
      AND coalesce(u.is_disabled, false) = false
  ) THEN
    RAISE EXCEPTION 'resident_registration_membership_not_found' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_estate_id::text || ':' || lower(building_value) || ':' || lower(unit_value), 0
  ));

  SELECT b.* INTO building_row
  FROM public.buildings b
  WHERE b.estate_id = p_estate_id AND lower(b.name) = lower(building_value)
  ORDER BY b.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.buildings(estate_id, name)
    VALUES (p_estate_id, building_value)
    RETURNING * INTO building_row;
  END IF;

  SELECT u.* INTO unit_row
  FROM public.units u
  WHERE u.estate_id = p_estate_id
    AND u.building_id = building_row.id
    AND lower(u.unit_code) = lower(unit_value)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.units(estate_id, building_id, unit_code, unit_type, status)
    VALUES (p_estate_id, building_row.id, unit_value, 'Apartment', 'available')
    RETURNING * INTO unit_row;
  END IF;

  IF unit_row.status NOT IN ('available', 'occupied') THEN
    RAISE EXCEPTION 'apartment_not_available_for_registration' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id = unit_row.id
      AND ru.end_date IS NULL
      AND ru.resident_user_id <> p_resident_user_id
  ) THEN
    RAISE EXCEPTION 'apartment_already_has_a_primary_resident' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.resident_user_id = p_resident_user_id
      AND ru.end_date IS NULL
      AND (ru.unit_id <> unit_row.id OR ru.estate_id <> p_estate_id)
  ) THEN
    RAISE EXCEPTION 'resident_already_has_an_apartment_assignment' USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id = unit_row.id
      AND ru.resident_user_id = p_resident_user_id
      AND ru.estate_id = p_estate_id
      AND ru.end_date IS NULL
  ) THEN
    INSERT INTO public.resident_units(estate_id, unit_id, resident_user_id, start_date)
    VALUES (p_estate_id, unit_row.id, p_resident_user_id, CURRENT_DATE);
  END IF;

  UPDATE public.units SET status = 'occupied' WHERE id = unit_row.id;

  RETURN QUERY SELECT unit_row.id, building_row.id, unit_row.unit_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_resident_apartment(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_resident_apartment(uuid, uuid, text, text) TO service_role;
