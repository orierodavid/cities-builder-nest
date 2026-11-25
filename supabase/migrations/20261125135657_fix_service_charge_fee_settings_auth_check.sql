CREATE OR REPLACE FUNCTION public.get_my_service_charge_fee_settings()
RETURNS TABLE(enabled boolean, fee_mode text, fee_value bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  -- auth.uid() is the authoritative authenticated-session check for PostgREST.
  -- Do not depend on the legacy request.jwt.claim.role setting.
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_required_legal_consent()
     OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.estate_memberships em
    WHERE em.user_id = actor_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.service_charge_enabled, s.service_charge_fee_mode, s.service_charge_fee_value
  FROM public.platform_payment_fee_settings s
  WHERE s.id = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_service_charge_fee_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_service_charge_fee_settings() TO authenticated;
