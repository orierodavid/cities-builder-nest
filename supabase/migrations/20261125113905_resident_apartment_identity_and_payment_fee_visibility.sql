-- Show each resident's assigned apartment identity and admin-configured payment fee.
BEGIN;

DROP FUNCTION IF EXISTS public.get_my_resident_identity();
CREATE FUNCTION public.get_my_resident_identity()
RETURNS TABLE(
  id_code text,
  status text,
  created_at timestamptz,
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
  result_row public.resident_identity_credentials%ROWTYPE;
  home record;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT ru.unit_id, ru.estate_id, u.unit_code, e.name
  INTO home
  FROM public.resident_units ru
  JOIN public.units u ON u.id = ru.unit_id AND u.estate_id = ru.estate_id
  JOIN public.estates e ON e.id = ru.estate_id
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id
    AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resident_apartment_assignment_required'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.resident_identity_credentials(user_id,id_code)
  VALUES(actor_id,'CBN-' || upper(replace(gen_random_uuid()::text,'-','')))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO result_row FROM public.resident_identity_credentials ric
  WHERE ric.user_id = actor_id AND ric.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resident_identity_unavailable' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT result_row.id_code, result_row.status, result_row.created_at,
    home.unit_id, home.unit_code, home.estate_id, home.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_resident_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_resident_identity() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_service_charge_fee_settings()
RETURNS TABLE(enabled boolean, fee_mode text, fee_value bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id = actor_id AND em.membership_role = 'resident' AND em.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.service_charge_enabled, s.service_charge_fee_mode, s.service_charge_fee_value
  FROM public.platform_payment_fee_settings s WHERE s.id = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_service_charge_fee_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_service_charge_fee_settings() TO authenticated;

COMMIT;
