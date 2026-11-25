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
  membership_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(au.email), au.email_confirmed_at INTO auth_email, auth_confirmed
  FROM auth.users au WHERE au.id = actor_id;
  IF auth_email IS NULL OR auth_confirmed IS NULL THEN
    RAISE EXCEPTION 'verified_invited_email_required' USING ERRCODE = '42501';
  END IF;
  SELECT i.* INTO invite FROM public.resident_household_invites i
  WHERE i.invitee_user_id = actor_id AND i.invitee_email = auth_email
    AND i.status = 'pending' AND i.expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'valid_household_invitation_not_found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.resident_units ru WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL)
     OR EXISTS (SELECT 1 FROM public.estate_memberships em WHERE em.user_id = actor_id AND em.membership_role = 'resident' AND em.status = 'active' AND em.estate_id <> invite.estate_id) THEN
    RAISE EXCEPTION 'invitee_already_assigned_to_another_apartment' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.users AS existing_user(id, full_name, is_active)
  VALUES (actor_id, invite.invitee_full_name, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(nullif(existing_user.full_name, ''), EXCLUDED.full_name),
    is_active = true, updated_at = now();
  INSERT INTO public.estate_memberships(estate_id, user_id, membership_role, status)
  VALUES (invite.estate_id, actor_id, 'resident', 'invited')
  ON CONFLICT (estate_id, user_id) DO UPDATE SET status = 'invited'
  WHERE public.estate_memberships.membership_role = 'resident'
  RETURNING id INTO membership_id;
  IF membership_id IS NULL THEN
    RAISE EXCEPTION 'invitee_has_conflicting_estate_role' USING ERRCODE = '23505';
  END IF;
  UPDATE public.resident_household_invites SET status = 'accepted', accepted_at = now() WHERE id = invite.id;
  RETURN QUERY SELECT invite.estate_id, invite.unit_id, invite.invitee_full_name;
END;
$$;