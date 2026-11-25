CREATE OR REPLACE FUNCTION public.reject_resident_account(p_estate_id uuid, p_user_id uuid, p_approver_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assigned_unit uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_approver_id AND ur.role = 'platform_admin')
     AND NOT EXISTS (
       SELECT 1 FROM public.estate_memberships manager
       WHERE manager.estate_id = p_estate_id AND manager.user_id = p_approver_id
         AND manager.membership_role IN ('facility_manager','estate_manager','estate_admin')
         AND manager.status = 'active'
     ) THEN
    RAISE EXCEPTION 'resident_approval_not_authorized';
  END IF;

  UPDATE public.estate_memberships
  SET status = 'suspended'
  WHERE estate_id = p_estate_id AND user_id = p_user_id
    AND membership_role = 'resident' AND status = 'invited';
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.resident_household_invites
  SET status = 'cancelled'
  WHERE estate_id = p_estate_id AND invitee_user_id = p_user_id
    AND status IN ('pending','accepted');

  UPDATE public.resident_units
  SET end_date = current_date
  WHERE estate_id = p_estate_id AND resident_user_id = p_user_id
    AND end_date IS NULL
  RETURNING unit_id INTO assigned_unit;

  IF assigned_unit IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id = assigned_unit AND ru.end_date IS NULL
  ) THEN
    UPDATE public.units SET status = 'available' WHERE id = assigned_unit;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_resident_account(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_resident_account(uuid,uuid,uuid) TO service_role;