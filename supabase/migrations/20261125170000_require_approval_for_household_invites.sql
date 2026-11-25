BEGIN;

-- Household acceptance is not apartment approval. Keep the invitee pending until
-- an authorized estate manager approves the resident membership.
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
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(au.email), au.email_confirmed_at
  INTO auth_email, auth_confirmed
  FROM auth.users au WHERE au.id = actor_id;

  IF auth_email IS NULL OR auth_confirmed IS NULL THEN
    RAISE EXCEPTION 'verified_invited_email_required' USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO invite
  FROM public.resident_household_invites i
  WHERE i.invitee_user_id = actor_id
    AND i.invitee_email = auth_email
    AND i.status = 'pending'
    AND i.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'valid_household_invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'invitee_already_assigned_to_another_apartment' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id = actor_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
      AND em.estate_id <> invite.estate_id
  ) THEN
    RAISE EXCEPTION 'invitee_already_assigned_to_another_apartment' USING ERRCODE = '23505';
  END IF;

  UPDATE public.resident_household_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite.id;

  INSERT INTO public.users AS existing_user(id, full_name, is_active)
  VALUES (actor_id, invite.invitee_full_name, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(nullif(existing_user.full_name, ''), EXCLUDED.full_name),
    is_active = true,
    updated_at = now();

  INSERT INTO public.estate_memberships(estate_id, user_id, membership_role, status)
  VALUES (invite.estate_id, actor_id, 'resident', 'invited')
  ON CONFLICT (estate_id, user_id, membership_role)
  DO UPDATE SET status = 'invited';

  -- Deliberately do not create resident_units here. Apartment access is assigned
  -- atomically by approve_resident_account after management approval.

  RETURN QUERY SELECT invite.estate_id, invite.unit_id, invite.invitee_full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_resident_household_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_resident_household_invite() TO authenticated;

-- Approval activates the membership and completes the apartment assignment.
CREATE OR REPLACE FUNCTION public.approve_resident_account(
  p_estate_id uuid,
  p_user_id uuid,
  p_approver_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_user uuid;
  accepted_invite public.resident_household_invites%ROWTYPE;
  active_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_approver_id AND ur.role = 'platform_admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships manager
    WHERE manager.estate_id = p_estate_id
      AND manager.user_id = p_approver_id
      AND manager.membership_role = 'facility_manager'
      AND manager.status = 'active'
  ) THEN
    RAISE EXCEPTION 'resident_approval_not_authorized';
  END IF;

  SELECT * INTO accepted_invite
  FROM public.resident_household_invites i
  WHERE i.invitee_user_id = p_user_id
    AND i.estate_id = p_estate_id
    AND i.status = 'accepted'
  ORDER BY i.accepted_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(accepted_invite.unit_id::text, 0)
    );

    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = p_user_id AND ru.end_date IS NULL
        AND (ru.unit_id <> accepted_invite.unit_id OR ru.estate_id <> accepted_invite.estate_id)
    ) THEN
      RAISE EXCEPTION 'resident_already_has_another_apartment';
    END IF;

    SELECT count(*) INTO active_count
    FROM public.resident_units ru
    JOIN public.estate_memberships em
      ON em.user_id = ru.resident_user_id AND em.estate_id = ru.estate_id
    WHERE ru.unit_id = accepted_invite.unit_id
      AND ru.end_date IS NULL
      AND em.membership_role = 'resident'
      AND em.status = 'active'
      AND ru.resident_user_id <> p_user_id;

    IF active_count >= 2 THEN
      RAISE EXCEPTION 'apartment_resident_limit_reached';
    END IF;
  END IF;

  UPDATE public.estate_memberships
  SET status = 'active'
  WHERE estate_id = p_estate_id
    AND user_id = p_user_id
    AND membership_role = 'resident'
    AND status = 'invited';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.users
  SET is_active = true, updated_at = now()
  WHERE id = p_user_id
  RETURNING id INTO v_updated_user;

  IF v_updated_user IS NULL THEN
    RAISE EXCEPTION 'resident_profile_not_found';
  END IF;

  IF accepted_invite.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = p_user_id
        AND ru.estate_id = accepted_invite.estate_id
        AND ru.unit_id = accepted_invite.unit_id
        AND ru.end_date IS NULL
    ) THEN
      INSERT INTO public.resident_units(estate_id, unit_id, resident_user_id, start_date)
      VALUES (accepted_invite.estate_id, accepted_invite.unit_id, p_user_id, CURRENT_DATE);
    END IF;

    UPDATE public.units
    SET status = 'occupied'
    WHERE id = accepted_invite.unit_id
      AND estate_id = accepted_invite.estate_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_resident_account(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_resident_account(uuid, uuid, uuid) TO service_role;

-- Return incoming invitation details and accepted-but-unapproved membership state
-- without granting the invitee any apartment membership access.
DROP FUNCTION IF EXISTS public.get_my_household_members();
CREATE FUNCTION public.get_my_household_members()
RETURNS TABLE(
  member_user_id uuid,
  member_name text,
  member_role text,
  invitation_email text,
  invitation_expires_at timestamptz,
  invitation_id uuid,
  invitation_estate_name text,
  invitation_building_name text,
  invitation_unit_code text
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
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
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
      NULL::text, NULL::timestamptz, NULL::uuid,
      NULL::text, NULL::text, NULL::text
    FROM public.resident_units ru
    JOIN public.users u ON u.id = ru.resident_user_id
    JOIN public.estate_memberships em
      ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
    WHERE ru.unit_id = home_unit AND ru.estate_id = home_estate
      AND ru.end_date IS NULL
      AND em.membership_role = 'resident' AND em.status = 'active'

    UNION ALL

    SELECT em.user_id, coalesce(u.full_name, i.invitee_full_name),
      'awaiting_approval'::text, i.invitee_email, i.expires_at, i.id,
      e.name, b.name, unit.unit_code
    FROM public.estate_memberships em
    JOIN public.resident_household_invites i
      ON i.invitee_user_id = em.user_id
      AND i.estate_id = em.estate_id
      AND i.status = 'accepted'
    JOIN public.users u ON u.id = em.user_id
    JOIN public.estates e ON e.id = i.estate_id
    JOIN public.units unit ON unit.id = i.unit_id
    JOIN public.buildings b ON b.id = unit.building_id
    WHERE em.estate_id = home_estate
      AND em.membership_role = 'resident'
      AND em.status = 'invited'
    ORDER BY 3, 2;
    RETURN;
  END IF;

  -- An accepted household invitation is visible to the invitee while pending
  -- administrator approval. The estate/apartment are display-only invitation data.
  RETURN QUERY
  SELECT i.invitee_user_id, i.invitee_full_name, 'awaiting_approval'::text,
    i.invitee_email, i.expires_at, i.id, e.name, b.name, unit.unit_code
  FROM public.resident_household_invites i
  JOIN public.estate_memberships em
    ON em.estate_id = i.estate_id AND em.user_id = i.invitee_user_id
  JOIN public.estates e ON e.id = i.estate_id
  JOIN public.units unit ON unit.id = i.unit_id
  JOIN public.buildings b ON b.id = unit.building_id
  WHERE i.invitee_user_id = actor_id
    AND i.status = 'accepted'
    AND em.membership_role = 'resident'
    AND em.status = 'invited';
  GET DIAGNOSTICS incoming_count = ROW_COUNT;
  IF incoming_count > 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT NULL::uuid, 'Apartment invitation'::text, 'incoming'::text,
    i.invitee_email, i.expires_at, i.id, e.name, b.name, unit.unit_code
  FROM public.resident_household_invites i
  JOIN public.estates e ON e.id = i.estate_id
  JOIN public.units unit ON unit.id = i.unit_id
  JOIN public.buildings b ON b.id = unit.building_id
  WHERE i.invitee_user_id = actor_id
    AND i.status = 'pending'
    AND i.expires_at > now();
  GET DIAGNOSTICS incoming_count = ROW_COUNT;
  IF incoming_count > 0 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id = actor_id
      AND em.membership_role = 'resident'
      AND em.status = 'active'
  ) THEN
    RETURN QUERY
    SELECT NULL::uuid, 'No apartment assigned'::text, 'unassigned'::text,
      NULL::text, NULL::timestamptz, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_household_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_household_members() TO authenticated;

COMMIT;
