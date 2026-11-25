BEGIN;

DROP FUNCTION IF EXISTS public.get_my_resident_identity();
CREATE FUNCTION public.get_my_resident_identity()
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
  home_estate uuid;
  home_unit_code text;
  home_estate_name text;
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

  SELECT ru.unit_id, ru.estate_id, u.unit_code, e.name
    INTO home_unit, home_estate, home_unit_code, home_estate_name
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

DROP FUNCTION IF EXISTS public.get_my_household_members();
CREATE FUNCTION public.get_my_household_members()
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

  IF EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id = actor_id AND em.membership_role = 'resident' AND em.status = 'active'
  ) THEN
    RETURN QUERY
    SELECT NULL::uuid, 'No apartment assigned'::text, 'unassigned'::text,
      NULL::text, NULL::timestamptz, NULL::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.resident_household_invites i
      WHERE i.invitee_user_id = actor_id AND i.status = 'pending' AND i.expires_at > now()
    )
    UNION ALL
    SELECT NULL::uuid, 'Apartment invitation'::text, 'incoming'::text,
      i.invitee_email, i.expires_at, i.id
    FROM public.resident_household_invites i
    WHERE i.invitee_user_id = actor_id AND i.status = 'pending' AND i.expires_at > now();
    RETURN;
  END IF;

  RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_household_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_household_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_resident_household_invite(
  p_email text,
  p_full_name text
)
RETURNS TABLE(invite_id uuid, estate_id uuid, unit_id uuid, invitee_email text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_email text;
  existing_invitee_id uuid;
  home public.resident_units%ROWTYPE;
  unit_row public.units%ROWTYPE;
  resident_count integer;
  pending_count integer;
  is_primary boolean;
  created_invite public.resident_household_invites%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR
     btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_household_invitation_details' USING ERRCODE = '22023';
  END IF;

  SELECT lower(au.email) INTO actor_email FROM auth.users au WHERE au.id = actor_id;
  IF actor_email = lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'cannot_invite_yourself' USING ERRCODE = '22023';
  END IF;

  SELECT au.id INTO existing_invitee_id
  FROM auth.users au
  WHERE lower(au.email) = lower(btrim(p_email))
  LIMIT 1;

  SELECT ru.* INTO home
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at ASC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.* INTO unit_row FROM public.units u
  WHERE u.id = home.unit_id AND u.estate_id = home.estate_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apartment_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id = home.unit_id AND ru.end_date IS NULL
      AND (ru.created_at, ru.id) < (home.created_at, home.id)
  ) INTO is_primary;
  IF NOT is_primary THEN
    RAISE EXCEPTION 'primary_resident_only' USING ERRCODE = '42501';
  END IF;

  IF existing_invitee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.resident_user_id = existing_invitee_id AND ru.end_date IS NULL
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = existing_invitee_id
        AND ru.unit_id = home.unit_id AND ru.end_date IS NULL
    ) THEN
      RAISE EXCEPTION 'invitee_already_in_household' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'invitee_already_assigned_to_another_apartment' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(home.unit_id::text, 0));
  SELECT count(*) INTO resident_count FROM public.resident_units ru
  WHERE ru.unit_id = home.unit_id AND ru.end_date IS NULL;
  UPDATE public.resident_household_invites
  SET status = 'expired'
  WHERE unit_id = home.unit_id AND status = 'pending' AND expires_at <= now();
  SELECT count(*) INTO pending_count FROM public.resident_household_invites i
  WHERE i.unit_id = home.unit_id AND i.status = 'pending' AND i.expires_at > now();
  IF resident_count + pending_count >= 2 THEN
    RAISE EXCEPTION 'apartment_resident_limit_reached' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resident_household_invites i
    WHERE i.unit_id = home.unit_id AND i.invitee_email = lower(btrim(p_email))
      AND i.status = 'pending' AND i.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'household_invitation_already_pending' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.resident_household_invites(
    estate_id, unit_id, inviter_user_id, invitee_email, invitee_full_name
  ) VALUES (
    home.estate_id, home.unit_id, actor_id, lower(btrim(p_email)), btrim(p_full_name)
  ) RETURNING * INTO created_invite;

  RETURN QUERY SELECT created_invite.id, created_invite.estate_id, created_invite.unit_id,
    created_invite.invitee_email, created_invite.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_resident_household_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_resident_household_invite(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_resident_household_invite()
RETURNS TABLE(estate_id uuid, unit_id uuid, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  auth_email text;
  auth_confirmed timestamptz;
  invite public.resident_household_invites%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(au.email), au.email_confirmed_at INTO auth_email, auth_confirmed
  FROM auth.users au WHERE au.id = actor_id;
  IF auth_email IS NULL OR auth_confirmed IS NULL THEN
    RAISE EXCEPTION 'verified_invited_email_required' USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO invite FROM public.resident_household_invites i
  WHERE i.invitee_user_id = actor_id AND i.invitee_email = auth_email
    AND i.status = 'pending' AND i.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'valid_household_invitation_not_found' USING ERRCODE = 'P0002'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = actor_id AND ru.unit_id = invite.unit_id AND ru.end_date IS NULL
    ) THEN
      RAISE EXCEPTION 'invitee_already_in_household' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'invitee_already_assigned_to_another_apartment' USING ERRCODE = '23505';
  END IF;

  UPDATE public.resident_household_invites SET status = 'accepted', accepted_at = now()
  WHERE id = invite.id;

  INSERT INTO public.users AS existing_user(id, full_name, is_active)
  VALUES(actor_id, invite.invitee_full_name, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(nullif(existing_user.full_name, ''), EXCLUDED.full_name),
    is_active = true;

  INSERT INTO public.estate_memberships(estate_id, user_id, membership_role, status)
  VALUES(invite.estate_id, actor_id, 'resident', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.resident_units(estate_id, unit_id, resident_user_id)
  VALUES(invite.estate_id, invite.unit_id, actor_id);

  UPDATE public.units SET status = 'occupied'
  WHERE id = invite.unit_id AND estate_id = invite.estate_id;

  RETURN QUERY SELECT invite.estate_id, invite.unit_id, invite.invitee_full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_resident_household_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_resident_household_invite() TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_resident_household_member(p_member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home public.resident_units%ROWTYPE;
  is_primary boolean;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  SELECT ru.* INTO home
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at ASC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE = '42501'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.resident_units earlier
    WHERE earlier.unit_id = home.unit_id AND earlier.end_date IS NULL
      AND (earlier.created_at, earlier.id) < (home.created_at, home.id)
  ) INTO is_primary;
  IF NOT is_primary THEN RAISE EXCEPTION 'primary_resident_only' USING ERRCODE = '42501'; END IF;
  IF p_member_user_id IS NULL OR p_member_user_id = actor_id THEN
    RAISE EXCEPTION 'cannot_remove_primary_resident' USING ERRCODE = '22023';
  END IF;

  UPDATE public.resident_units
  SET end_date = current_date
  WHERE resident_user_id = p_member_user_id
    AND unit_id = home.unit_id
    AND estate_id = home.estate_id
    AND end_date IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'household_member_not_found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_resident_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_resident_household_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_resident_household_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home public.resident_units%ROWTYPE;
  is_primary boolean;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  SELECT ru.* INTO home
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at ASC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE = '42501'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.resident_units earlier
    WHERE earlier.unit_id = home.unit_id AND earlier.end_date IS NULL
      AND (earlier.created_at, earlier.id) < (home.created_at, home.id)
  ) INTO is_primary;
  IF NOT is_primary THEN RAISE EXCEPTION 'primary_resident_only' USING ERRCODE = '42501'; END IF;

  UPDATE public.resident_household_invites
  SET status = 'cancelled'
  WHERE id = p_invite_id AND unit_id = home.unit_id AND estate_id = home.estate_id
    AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'pending_household_invitation_not_found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_resident_household_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_resident_household_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_management_wallet_funding_payments()
RETURNS TABLE(
  id uuid,
  estate_id uuid,
  resident_user_id uuid,
  amount_kobo bigint,
  currency text,
  status text,
  reference text,
  created_at timestamptz,
  description text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_account_access_enabled() OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_platform_admin() AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
  ) THEN
    RAISE EXCEPTION 'estate_management_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id, m.estate_id, i.resident_user_id, i.amount_kobo, i.currency::text,
    CASE WHEN i.status = 'successful' AND i.verified_at IS NULL THEN 'pending' ELSE i.status END,
    i.reference, coalesce(i.verified_at, i.created_at), 'Wallet top-up'::text
  FROM public.squad_wallet_funding_intents i
  JOIN LATERAL (
    SELECT em.estate_id
    FROM public.estate_memberships em
    WHERE em.user_id = i.resident_user_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
      AND (private.is_platform_admin() OR private.is_active_estate_manager(em.estate_id))
    ORDER BY em.created_at DESC
    LIMIT 1
  ) m ON true

  UNION ALL

  SELECT i.id, m.estate_id, i.resident_user_id, i.amount_kobo, i.currency::text,
    CASE WHEN i.status = 'successful' AND i.verified_at IS NULL THEN 'pending' ELSE i.status END,
    i.reference, coalesce(i.verified_at, i.created_at), 'Wallet top-up'::text
  FROM public.paystack_wallet_funding_intents i
  JOIN LATERAL (
    SELECT em.estate_id
    FROM public.estate_memberships em
    WHERE em.user_id = i.resident_user_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
      AND (private.is_platform_admin() OR private.is_active_estate_manager(em.estate_id))
    ORDER BY em.created_at DESC
    LIMIT 1
  ) m ON true
  ORDER BY 8 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_management_wallet_funding_payments()
RETURNS TABLE(id uuid, estate_id uuid, resident_user_id uuid, amount_kobo bigint, currency text, status text, reference text, created_at timestamptz, description text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT * FROM private.get_management_wallet_funding_payments();
$$;
REVOKE ALL ON FUNCTION public.get_management_wallet_funding_payments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_management_wallet_funding_payments() TO authenticated;

COMMIT;