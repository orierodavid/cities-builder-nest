-- Keep security visitor lookups and denials inside narrowly scoped PostgreSQL operations.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_gate_visitor_pass_for_security(
  target_estate_id uuid,
  target_access_code_hash text
)
RETURNS TABLE (
  id uuid, host_user_id uuid, visitor_name text, visitor_phone text,
  valid_from timestamptz, valid_until timestamptz, status text, host_full_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR target_access_code_hash IS NULL OR length(target_access_code_hash) <> 64
     OR NOT public.current_user_has_required_legal_consent()
     OR NOT EXISTS (
       SELECT 1 FROM public.estate_memberships m
       JOIN public.estates e ON e.id = m.estate_id
       WHERE m.estate_id = target_estate_id AND m.user_id = actor_id
         AND m.membership_role = 'security' AND m.status = 'active' AND e.is_enabled = true
     ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.host_user_id, p.visitor_name, p.visitor_phone, p.valid_from, p.valid_until, p.status, u.full_name
  FROM public.visitor_passes p
  LEFT JOIN public.users u ON u.id = p.host_user_id
  WHERE p.estate_id = target_estate_id AND p.access_code_hash = target_access_code_hash
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deny_visitor_pass_for_security(
  target_estate_id uuid, target_pass_id uuid, target_reason text DEFAULT NULL
)
RETURNS TABLE (result text, pass_id uuid, pass_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  denied_id uuid;
  denied_status text;
BEGIN
  IF actor_id IS NULL OR NOT public.current_user_has_required_legal_consent()
     OR (target_reason IS NOT NULL AND length(target_reason) > 500)
     OR NOT EXISTS (
       SELECT 1 FROM public.estate_memberships m
       JOIN public.estates e ON e.id = m.estate_id
       WHERE m.estate_id = target_estate_id AND m.user_id = actor_id
         AND m.membership_role = 'security' AND m.status = 'active' AND e.is_enabled = true
     ) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  UPDATE public.visitor_passes AS p
  SET status = 'revoked'
  WHERE p.id = target_pass_id AND p.estate_id = target_estate_id
    AND p.status = 'active' AND p.valid_from <= now() AND p.valid_until > now()
  RETURNING p.id, p.status INTO denied_id, denied_status;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_active'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  INSERT INTO public.visitor_pass_denials (estate_id, visitor_pass_id, denied_by, reason)
  VALUES (target_estate_id, denied_id, actor_id, nullif(btrim(target_reason), ''));

  RETURN QUERY SELECT 'denied'::text, denied_id, denied_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_gate_visitor_pass_for_security(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deny_visitor_pass_for_security(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gate_visitor_pass_for_security(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deny_visitor_pass_for_security(uuid, uuid, text) TO authenticated;

COMMIT;
