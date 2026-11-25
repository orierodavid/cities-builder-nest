
-- Support Supabase's current secret-key authentication model. The RPC is
-- executable only by service_role; do not depend on legacy JWT role claims.
CREATE OR REPLACE FUNCTION private.post_wallet_credit(
  p_resident_user_id uuid,
  p_amount_kobo bigint,
  p_source text,
  p_external_reference text,
  p_provider_reference text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_wallet public.resident_wallets%rowtype;
  v_id uuid;
  v_existing public.wallet_transactions%rowtype;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 OR p_amount_kobo > 9000000000000000
    OR p_resident_user_id IS NULL
    OR p_source NOT IN ('squad_virtual_account','paystack_virtual_account','moniepoint_virtual_account',
      'squad_checkout','paystack_checkout','moniepoint_checkout','wallet_refund','admin_adjustment')
    OR p_external_reference IS NULL OR char_length(btrim(p_external_reference)) NOT BETWEEN 1 AND 160
    OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 1 AND 200
    OR coalesce(jsonb_typeof(p_metadata), 'object') <> 'object' THEN
    RAISE EXCEPTION 'invalid_wallet_credit' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wallet FROM public.resident_wallets
  WHERE resident_user_id = p_resident_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_wallet_not_found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.wallet_transactions(
    wallet_id,resident_user_id,entry_type,amount_kobo,source,
    external_reference,provider_reference,description,metadata
  ) VALUES (
    v_wallet.id,p_resident_user_id,'credit',p_amount_kobo,p_source,btrim(p_external_reference),
    nullif(btrim(p_provider_reference),''),btrim(p_description),coalesce(p_metadata,'{}'::jsonb)
  )
  ON CONFLICT(external_reference) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO v_existing FROM public.wallet_transactions
  WHERE external_reference=btrim(p_external_reference);
  IF NOT FOUND OR v_existing.resident_user_id <> p_resident_user_id
    OR v_existing.amount_kobo <> p_amount_kobo OR v_existing.entry_type <> 'credit' THEN
    RAISE EXCEPTION 'wallet_credit_reference_conflict' USING ERRCODE = '23505';
  END IF;
  RETURN v_existing.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_verified_wallet_credit(
  p_resident_user_id uuid,
  p_amount_kobo bigint,
  p_source text,
  p_external_reference text,
  p_provider_reference text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  RETURN private.post_wallet_credit(
    p_resident_user_id,p_amount_kobo,p_source,p_external_reference,
    p_provider_reference,p_description,p_metadata
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.post_verified_wallet_credit(uuid,bigint,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_verified_wallet_credit(uuid,bigint,text,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.post_wallet_credit(uuid,bigint,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.post_wallet_credit(uuid,bigint,text,text,text,text,jsonb) TO service_role;

-- Management-only, estate-scoped wallet top-up history. Pending funding
-- intents are visible before a wallet ledger entry exists.
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_account_access_enabled()
    OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_platform_admin() AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.user_id=auth.uid() AND m.status='active'
      AND m.membership_role IN ('facility_manager','estate_manager','estate_admin')
  ) THEN
    RAISE EXCEPTION 'estate_management_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id, m.estate_id, i.resident_user_id, i.amount_kobo,
    i.currency::text, i.status, i.reference,
    coalesce(i.verified_at,i.created_at), 'Wallet top-up'::text
  FROM public.squad_wallet_funding_intents i
  JOIN LATERAL (
    SELECT em.estate_id
    FROM public.estate_memberships em
    WHERE em.user_id=i.resident_user_id
      AND em.membership_role='resident' AND em.status='active'
      AND (
        private.is_platform_admin()
        OR private.is_active_estate_manager(em.estate_id)
      )
    ORDER BY em.created_at DESC
    LIMIT 1
  ) m ON true
  WHERE private.is_platform_admin() OR m.estate_id IS NOT NULL
  ORDER BY coalesce(i.verified_at,i.created_at) DESC;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_management_wallet_funding_payments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_management_wallet_funding_payments() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_management_wallet_funding_payments()
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
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT * FROM private.get_management_wallet_funding_payments();
$function$;
REVOKE ALL ON FUNCTION public.get_management_wallet_funding_payments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_management_wallet_funding_payments() TO authenticated;

-- Estate managers explicitly create the primary resident-to-apartment link.
CREATE OR REPLACE FUNCTION private.assign_primary_resident_to_unit(
  p_estate_id uuid,
  p_resident_user_id uuid,
  p_unit_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_unit public.units%rowtype;
  v_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_account_access_enabled()
    OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_platform_admin() AND NOT private.is_active_estate_manager(p_estate_id) THEN
    RAISE EXCEPTION 'estate_management_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.estates e WHERE e.id=p_estate_id AND e.is_enabled=true
  ) THEN
    RAISE EXCEPTION 'estate_not_available' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships em
    JOIN public.users u ON u.id=em.user_id
    WHERE em.estate_id=p_estate_id AND em.user_id=p_resident_user_id
      AND em.membership_role='resident' AND em.status='active'
      AND u.is_active=true AND coalesce(u.is_disabled,false)=false AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_resident_membership_required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resident_household_invites hi
    WHERE hi.invitee_user_id=p_resident_user_id AND hi.status='accepted'
  ) THEN
    RAISE EXCEPTION 'household_member_inherits_primary_assignment' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_unit FROM public.units
  WHERE id=p_unit_id AND estate_id=p_estate_id AND status='available'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'available_unit_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.resident_user_id=p_resident_user_id AND ru.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'resident_already_has_active_assignment' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id=p_unit_id AND ru.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'unit_already_has_primary_resident' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.resident_units(unit_id,resident_user_id,estate_id,start_date)
  VALUES(p_unit_id,p_resident_user_id,p_estate_id,CURRENT_DATE)
  RETURNING id INTO v_assignment_id;
  UPDATE public.units SET status='occupied' WHERE id=p_unit_id AND estate_id=p_estate_id;
  RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION private.assign_primary_resident_to_unit(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assign_primary_resident_to_unit(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_primary_resident_to_unit(
  p_estate_id uuid,
  p_resident_user_id uuid,
  p_unit_id uuid
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT private.assign_primary_resident_to_unit(p_estate_id,p_resident_user_id,p_unit_id);
$function$;
REVOKE ALL ON FUNCTION public.assign_primary_resident_to_unit(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_primary_resident_to_unit(uuid,uuid,uuid) TO authenticated;

