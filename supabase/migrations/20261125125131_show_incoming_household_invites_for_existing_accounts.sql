BEGIN;
CREATE OR REPLACE FUNCTION public.get_my_household_members()
RETURNS TABLE(
  member_user_id uuid,
  member_name text,
  member_role text,
  invitation_email text,
  invitation_expires_at timestamptz,
  invitation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home_unit uuid;
  home_estate uuid;
  incoming_count integer := 0;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT ru.unit_id, ru.estate_id INTO home_unit, home_estate
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at ASC
  LIMIT 1;

  IF home_unit IS NOT NULL THEN
    RETURN QUERY
    SELECT ru.resident_user_id, u.full_name,
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.resident_units earlier
        WHERE earlier.unit_id = ru.unit_id AND earlier.end_date IS NULL
          AND (earlier.created_at, earlier.id) < (ru.created_at, ru.id)
      ) THEN 'primary'::text ELSE 'resident'::text END,
      NULL::text, NULL::timestamptz, NULL::uuid
    FROM public.resident_units ru
    JOIN public.users u ON u.id = ru.resident_user_id
    JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
    WHERE ru.unit_id = home_unit AND ru.estate_id = home_estate AND ru.end_date IS NULL
      AND em.membership_role = 'resident' AND em.status = 'active'
    UNION ALL
    SELECT NULL::uuid, 'Invitation pending'::text, 'pending'::text,
      i.invitee_email, i.expires_at, i.id
    FROM public.resident_household_invites i
    WHERE i.unit_id = home_unit AND i.estate_id = home_estate
      AND i.status = 'pending' AND i.expires_at > now()
    ORDER BY 3, 2;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT NULL::uuid, 'Apartment invitation'::text, 'incoming'::text,
    i.invitee_email, i.expires_at, i.id
  FROM public.resident_household_invites i
  WHERE i.invitee_user_id = actor_id AND i.status = 'pending' AND i.expires_at > now();
  GET DIAGNOSTICS incoming_count = ROW_COUNT;
  IF incoming_count > 0 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id = actor_id AND em.membership_role = 'resident' AND em.status = 'active'
  ) THEN
    RETURN QUERY
    SELECT NULL::uuid, 'No apartment assigned'::text, 'unassigned'::text,
      NULL::text, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_household_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_household_members() TO authenticated;
COMMIT;