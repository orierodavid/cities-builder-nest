
CREATE OR REPLACE FUNCTION private.get_management_wallet_funding_payments()
RETURNS TABLE(
  id uuid, estate_id uuid, resident_user_id uuid, amount_kobo bigint,
  currency text, status text, reference text, created_at timestamptz, description text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF NOT private.is_account_access_enabled() OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE='42501';
  END IF;
  IF NOT private.is_platform_admin() AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m WHERE m.user_id=auth.uid()
      AND m.status='active' AND m.membership_role IN ('facility_manager','estate_manager','estate_admin')
  ) THEN RAISE EXCEPTION 'estate_management_required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT i.id,m.estate_id,i.resident_user_id,i.amount_kobo,i.currency::text,
    CASE WHEN i.status='successful' AND i.verified_at IS NULL THEN 'pending' ELSE i.status END,
    i.reference,coalesce(i.verified_at,i.created_at),'Wallet top-up'::text
  FROM public.squad_wallet_funding_intents i
  JOIN LATERAL (
    SELECT em.estate_id FROM public.estate_memberships em
    WHERE em.user_id=i.resident_user_id AND em.membership_role='resident' AND em.status='active'
      AND (private.is_platform_admin() OR private.is_active_estate_manager(em.estate_id))
    ORDER BY em.created_at DESC LIMIT 1
  ) m ON true
  ORDER BY coalesce(i.verified_at,i.created_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_my_wallet_funding_history()
RETURNS TABLE(
  id uuid, amount_kobo bigint, currency text, status text,
  reference text, created_at timestamptz, verified_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF NOT private.is_account_access_enabled() OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT i.id,i.amount_kobo,i.currency::text,
    CASE WHEN i.status='successful' AND i.verified_at IS NULL THEN 'pending' ELSE i.status END,
    i.reference,i.created_at,i.verified_at
  FROM public.squad_wallet_funding_intents i
  WHERE i.resident_user_id=auth.uid()
  ORDER BY i.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_my_wallet_funding_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_my_wallet_funding_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_wallet_funding_history()
RETURNS TABLE(
  id uuid, amount_kobo bigint, currency text, status text,
  reference text, created_at timestamptz, verified_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT * FROM private.get_my_wallet_funding_history();
$function$;
REVOKE ALL ON FUNCTION public.get_my_wallet_funding_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_funding_history() TO authenticated;
