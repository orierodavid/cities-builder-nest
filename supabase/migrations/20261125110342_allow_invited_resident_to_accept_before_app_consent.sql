BEGIN;
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
  UPDATE public.resident_household_invites SET status = 'accepted', accepted_at = now()
  WHERE id = invite.id;
  INSERT INTO public.users AS existing_user(id, full_name, is_active)
  VALUES(actor_id, invite.invitee_full_name, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(nullif(existing_user.full_name,''), EXCLUDED.full_name),
    is_active = true;
  INSERT INTO public.estate_memberships(estate_id,user_id,membership_role,status)
  VALUES(invite.estate_id,actor_id,'resident','active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.resident_units(estate_id,unit_id,resident_user_id)
  VALUES(invite.estate_id,invite.unit_id,actor_id);
  UPDATE public.units SET status = 'occupied'
  WHERE id = invite.unit_id AND estate_id = invite.estate_id;

  RETURN QUERY SELECT invite.estate_id, invite.unit_id, invite.invitee_full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_resident_household_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_resident_household_invite() TO authenticated;
COMMIT;