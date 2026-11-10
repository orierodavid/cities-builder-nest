-- Permit a manager to validate one explicitly requested resident candidate without
-- granting a broad directory query over all registered users.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_active_resident_candidate(
  target_estate_id uuid,
  target_user_id uuid
)
RETURNS TABLE(id uuid, full_name text, phone_e164 text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.full_name, u.phone_e164, u.is_active
  FROM public.users u
  JOIN public.estates e ON e.id = target_estate_id
  WHERE u.id = target_user_id
    AND u.is_active = true
    AND e.is_enabled = true
    AND (
      private.is_platform_admin()
      OR private.is_active_estate_manager(target_estate_id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_active_resident_candidate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_resident_candidate(uuid, uuid) TO authenticated;

COMMIT;