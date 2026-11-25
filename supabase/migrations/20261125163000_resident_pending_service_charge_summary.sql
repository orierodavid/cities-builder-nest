BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_pending_service_charge_total()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home_unit uuid;
  home_estate uuid;
  total_due bigint;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_account_access_enabled() OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT ru.unit_id, ru.estate_id INTO home_unit, home_estate
  FROM public.resident_units ru
  JOIN public.estate_memberships em
    ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id
    AND ru.end_date IS NULL
    AND em.membership_role = 'resident'
    AND em.status = 'active'
  ORDER BY ru.created_at DESC
  LIMIT 1;

  IF home_estate IS NULL THEN
    SELECT em.estate_id INTO home_estate
    FROM public.estate_memberships em
    WHERE em.user_id = actor_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
    ORDER BY em.created_at DESC
    LIMIT 1;
  END IF;

  IF home_estate IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(charge.amount_kobo), 0)::bigint
  INTO total_due
  FROM public.estate_service_charges charge
  WHERE charge.estate_id = home_estate
    AND charge.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.service_charge_payments payment
      WHERE payment.charge_id = charge.id
        AND (
          (home_unit IS NOT NULL AND payment.unit_id = home_unit)
          OR (payment.unit_id IS NULL AND payment.resident_user_id = actor_id)
        )
        AND payment.status = 'successful'
        AND payment.verified_at IS NOT NULL
    );

  RETURN COALESCE(total_due, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_pending_service_charge_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_service_charge_total() TO authenticated;

COMMIT;
