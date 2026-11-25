BEGIN;
CREATE OR REPLACE FUNCTION public.get_my_resident_identity()
RETURNS TABLE(
  id_code text,
  status text,
  created_at timestamptz,
  resident_name text,
  unit_id uuid,
  unit_code text,
  estate_id uuid,
  estate_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  resident_name_value text;
  identity_row public.resident_identity_credentials%ROWTYPE;
  home_unit uuid;
  home_unit_code text;
  home_estate uuid;
  home_estate_name text;
  assigned_estate uuid;
  assigned_estate_name text;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(u.full_name, ''), nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'CB Nest Resident')
    INTO resident_name_value
  FROM public.users u WHERE u.id = actor_id;

  SELECT em.estate_id, e.name
    INTO home_estate, home_estate_name
  FROM public.estate_memberships em
  JOIN public.estates e ON e.id = em.estate_id
  WHERE em.user_id = actor_id
    AND em.membership_role = 'resident'
    AND em.status = 'active'
  ORDER BY em.created_at DESC
  LIMIT 1;

  IF home_estate IS NULL THEN
    RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
  END IF;

  SELECT ru.unit_id, u.unit_code, ru.estate_id, e.name
    INTO home_unit, home_unit_code, assigned_estate, assigned_estate_name
  FROM public.resident_units ru
  JOIN public.units u ON u.id = ru.unit_id AND u.estate_id = ru.estate_id
  JOIN public.estates e ON e.id = ru.estate_id
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id
    AND ru.end_date IS NULL
    AND em.membership_role = 'resident'
    AND em.status = 'active'
  ORDER BY ru.created_at DESC
  LIMIT 1;

  IF assigned_estate IS NOT NULL THEN
    home_estate := assigned_estate;
    home_estate_name := assigned_estate_name;
  END IF;

  INSERT INTO public.resident_identity_credentials(user_id, id_code)
  VALUES(actor_id, 'CBN-' || upper(replace(gen_random_uuid()::text, '-', '')))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO identity_row
  FROM public.resident_identity_credentials ric
  WHERE ric.user_id = actor_id AND ric.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resident_identity_unavailable' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT
    identity_row.id_code,
    identity_row.status,
    identity_row.created_at,
    coalesce(resident_name_value, 'CB Nest Resident'),
    home_unit,
    home_unit_code,
    home_estate,
    home_estate_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_resident_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_resident_identity() TO authenticated;
COMMIT;