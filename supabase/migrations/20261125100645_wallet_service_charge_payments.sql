-- Atomic wallet settlement for a resident service charge.
CREATE OR REPLACE FUNCTION public.pay_service_charge_from_wallet(p_charge_id uuid)
RETURNS TABLE(payment_id uuid, wallet_transaction_id uuid, amount_kobo bigint, balance_kobo bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_charge public.estate_service_charges%rowtype;
  v_wallet public.resident_wallets%rowtype;
  v_balance bigint;
  v_reference text;
  v_transaction_id uuid;
  v_payment_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated'
     OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_account_access_enabled()
     OR NOT public.current_user_has_required_legal_consent() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_charge FROM public.estate_service_charges
    WHERE id = p_charge_id AND is_active = true FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = v_charge.estate_id AND m.user_id = v_user_id
      AND m.membership_role = 'resident' AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_estate_charge_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_reference := 'CBNEST-WALLET-SERVICE-' || p_charge_id::text || '-' || v_user_id::text;
  SELECT id INTO v_transaction_id FROM public.wallet_transactions
    WHERE external_reference = v_reference AND resident_user_id = v_user_id;
  IF FOUND THEN
    SELECT id INTO v_payment_id FROM public.service_charge_payments
      WHERE provider_reference = v_reference AND resident_user_id = v_user_id;
    SELECT coalesce(sum(CASE WHEN entry_type='credit' THEN amount_kobo ELSE -amount_kobo END),0)::bigint
      INTO v_balance FROM public.wallet_transactions
      WHERE wallet_id = (SELECT id FROM public.resident_wallets WHERE resident_user_id=v_user_id);
    RETURN QUERY SELECT v_payment_id, v_transaction_id, v_charge.amount_kobo, v_balance;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_charge_payments p
    WHERE p.charge_id = p_charge_id AND p.resident_user_id = v_user_id
      AND p.status IN ('pending','successful')) THEN
    RAISE EXCEPTION 'service_charge_payment_already_pending_or_paid' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_wallet FROM public.resident_wallets
    WHERE resident_user_id = v_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce(sum(CASE WHEN entry_type='credit' THEN amount_kobo ELSE -amount_kobo END),0)::bigint
    INTO v_balance FROM public.wallet_transactions
    WHERE wallet_id = v_wallet.id AND status = 'posted';
  IF v_balance < v_charge.amount_kobo THEN
    RAISE EXCEPTION 'insufficient_wallet_funds' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.wallet_transactions(
    wallet_id,resident_user_id,entry_type,amount_kobo,source,external_reference,description,metadata
  ) VALUES (
    v_wallet.id,v_user_id,'debit',v_charge.amount_kobo,'wallet_spend',v_reference,
    'Service charge payment',jsonb_build_object('charge_id',p_charge_id,'estate_id',v_charge.estate_id)
  ) RETURNING id INTO v_transaction_id;
  INSERT INTO public.service_charge_payments(
    charge_id,estate_id,resident_user_id,amount_kobo,fee_kobo,total_amount_kobo,
    currency,status,provider,provider_reference,verified_at
  ) VALUES (
    p_charge_id,v_charge.estate_id,v_user_id,v_charge.amount_kobo,0,v_charge.amount_kobo,
    'NGN','successful','wallet',v_reference,now()
  ) RETURNING id INTO v_payment_id;
  v_balance := v_balance - v_charge.amount_kobo;
  RETURN QUERY SELECT v_payment_id,v_transaction_id,v_charge.amount_kobo,v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_service_charge_from_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_service_charge_from_wallet(uuid) TO authenticated;
