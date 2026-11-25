
CREATE OR REPLACE FUNCTION private.get_unassigned_primary_residents(p_estate_id uuid)
RETURNS TABLE(user_id uuid, full_name text, phone_e164 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
  END IF;
  IF NOT private.is_account_access_enabled()
    OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE='42501';
  END IF;
  IF NOT private.is_platform_admin() AND NOT private.is_active_estate_manager(p_estate_id) THEN
    RAISE EXCEPTION 'estate_management_required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT u.id,u.full_name,u.phone_e164
  FROM public.users u
  JOIN public.estate_memberships em
    ON em.user_id=u.id AND em.estate_id=p_estate_id
  WHERE em.membership_role='resident' AND em.status='active'
    AND u.is_active=true AND coalesce(u.is_disabled,false)=false AND u.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id=u.id AND ru.end_date IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.resident_household_invites hi
      WHERE hi.invitee_user_id=u.id AND hi.status='accepted'
    )
  ORDER BY u.full_name;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_unassigned_primary_residents(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_unassigned_primary_residents(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unassigned_primary_residents(p_estate_id uuid)
RETURNS TABLE(user_id uuid, full_name text, phone_e164 text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT * FROM private.get_unassigned_primary_residents(p_estate_id);
$function$;
REVOKE ALL ON FUNCTION public.get_unassigned_primary_residents(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_unassigned_primary_residents(uuid) TO authenticated;
