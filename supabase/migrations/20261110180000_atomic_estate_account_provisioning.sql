-- Provision account profile and estate access atomically after Supabase Auth creates the identity.
-- Authorization is derived from the authenticated caller, never from caller-supplied actor IDs.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_estate_account_membership(
  target_estate_id uuid,
  target_user_id uuid,
  target_full_name text,
  target_role text,
  target_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estate_id uuid,
  user_id uuid,
  membership_role text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  is_admin boolean := private.is_platform_admin();
  membership_row public.estate_memberships%ROWTYPE;
  target_unit public.units%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated actor required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'current legal consent required' USING ERRCODE = '42501';
  END IF;
  IF target_full_name IS NULL OR length(btrim(target_full_name)) < 2 OR length(btrim(target_full_name)) > 120 THEN
    RAISE EXCEPTION 'invalid account name' USING ERRCODE = '22023';
  END IF;
  IF target_role NOT IN ('estate_admin', 'resident', 'facility_manager', 'security') THEN
    RAISE EXCEPTION 'unsupported estate role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = target_user_id) THEN
    RAISE EXCEPTION 'auth identity not found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estates e WHERE e.id = target_estate_id AND e.is_enabled = true) THEN
    RAISE EXCEPTION 'estate unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF NOT is_admin AND NOT private.is_active_estate_manager(target_estate_id) THEN
    RAISE EXCEPTION 'estate manager access required' USING ERRCODE = '42501';
  END IF;
  IF target_role = 'estate_admin' AND NOT is_admin THEN
    RAISE EXCEPTION 'platform administrator required for estate admin role' USING ERRCODE = '42501';
  END IF;
  IF (target_role = 'resident') <> (target_unit_id IS NOT NULL) THEN
    RAISE EXCEPTION 'resident accounts require a unit; staff accounts must not have one' USING ERRCODE = '22023';
  END IF;

  IF target_role = 'resident' THEN
    SELECT u.* INTO target_unit
    FROM public.units u
    WHERE u.id = target_unit_id AND u.estate_id = target_estate_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unit not in selected estate' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.unit_id = target_unit_id AND ru.end_date IS NULL
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'unit already assigned' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.users (id, full_name, phone_e164, is_active)
  VALUES (target_user_id, btrim(target_full_name), NULL, true)
  ON CONFLICT ON CONSTRAINT users_pkey DO UPDATE
    SET full_name = EXCLUDED.full_name, is_active = true;

  INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status)
  VALUES (target_estate_id, target_user_id, target_role, 'active')
  RETURNING * INTO membership_row;

  IF target_role = 'resident' THEN
    INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id)
    VALUES (target_estate_id, target_unit_id, target_user_id);
    UPDATE public.units AS target
    SET status = 'occupied'
    WHERE target.id = target_unit_id AND target.estate_id = target_estate_id;
  END IF;

  RETURN QUERY SELECT membership_row.id, membership_row.estate_id, membership_row.user_id,
    membership_row.membership_role, membership_row.status, membership_row.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_estate_account_membership(uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_estate_account_membership(uuid, uuid, text, text, uuid) TO authenticated;

COMMIT;
