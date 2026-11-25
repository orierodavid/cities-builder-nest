-- Resident household access, individual CB Nest IDs, and apartment-level service-charge billing.
BEGIN;

-- A home can have at most two active resident accounts. A resident account can
-- have only one active home assignment.
DROP INDEX IF EXISTS public.resident_units_one_active_assignment_per_unit_idx;
CREATE UNIQUE INDEX IF NOT EXISTS resident_units_one_active_assignment_per_resident_idx
  ON public.resident_units (resident_user_id) WHERE end_date IS NULL;

CREATE TABLE IF NOT EXISTS public.resident_household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email text NOT NULL,
  invitee_full_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','cancelled','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT resident_household_invites_email_check
    CHECK (invitee_email = lower(btrim(invitee_email)) AND length(invitee_email) <= 254),
  CONSTRAINT resident_household_invites_name_check
    CHECK (length(btrim(invitee_full_name)) BETWEEN 2 AND 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS resident_household_one_pending_invite_per_unit_email_idx
  ON public.resident_household_invites(unit_id, invitee_email)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS resident_household_invites_inviter_idx
  ON public.resident_household_invites(inviter_user_id, status, created_at DESC);

ALTER TABLE public.resident_household_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resident_household_invites FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_two_residents_per_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  active_count integer;
  pending_count integer;
BEGIN
  IF NEW.end_date IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.unit_id::text, 0));
  PERFORM 1 FROM public.units u WHERE u.id = NEW.unit_id AND u.estate_id = NEW.estate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resident_unit_not_in_estate' USING ERRCODE = '23503';
  END IF;
  SELECT count(*) INTO active_count
  FROM public.resident_units ru
  WHERE ru.unit_id = NEW.unit_id AND ru.end_date IS NULL
    AND (TG_OP = 'INSERT' OR ru.id IS DISTINCT FROM NEW.id);
  SELECT count(*) INTO pending_count
  FROM public.resident_household_invites i
  WHERE i.unit_id = NEW.unit_id AND i.status = 'pending' AND i.expires_at > now();
  IF active_count + pending_count >= 2 THEN
    RAISE EXCEPTION 'apartment_resident_limit_reached' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_two_residents_per_unit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_two_residents_per_unit ON public.resident_units;
CREATE TRIGGER enforce_two_residents_per_unit
  BEFORE INSERT OR UPDATE OF unit_id, estate_id, end_date ON public.resident_units
  FOR EACH ROW EXECUTE FUNCTION private.enforce_two_residents_per_unit();

CREATE OR REPLACE FUNCTION public.create_resident_household_invite(
  p_email text,
  p_full_name text
)
RETURNS TABLE(invite_id uuid, estate_id uuid, unit_id uuid, invitee_email text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home public.resident_units%ROWTYPE;
  unit_row public.units%ROWTYPE;
  resident_count integer;
  pending_count integer;
  is_primary boolean;
  created_invite public.resident_household_invites%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) > 254 OR
     btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_household_invitation_details' USING ERRCODE = '22023';
  END IF;

  SELECT ru.* INTO home
  FROM public.resident_units ru
  JOIN public.estate_memberships em
    ON em.estate_id = ru.estate_id AND em.user_id = ru.resident_user_id
  WHERE ru.resident_user_id = actor_id AND ru.end_date IS NULL
    AND em.membership_role = 'resident' AND em.status = 'active'
  ORDER BY ru.created_at ASC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.* INTO unit_row FROM public.units u
  WHERE u.id = home.unit_id AND u.estate_id = home.estate_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apartment_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id = home.unit_id AND ru.end_date IS NULL
      AND (ru.created_at, ru.id) < (home.created_at, home.id)
  ) INTO is_primary;
  IF NOT is_primary THEN
    RAISE EXCEPTION 'primary_resident_only' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(home.unit_id::text, 0));
  SELECT count(*) INTO resident_count FROM public.resident_units ru
    WHERE ru.unit_id = home.unit_id AND ru.end_date IS NULL;
  SELECT count(*) INTO pending_count FROM public.resident_household_invites i
    WHERE i.unit_id = home.unit_id AND i.status = 'pending' AND i.expires_at > now();
  IF resident_count + pending_count >= 2 THEN
    RAISE EXCEPTION 'apartment_resident_limit_reached' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resident_household_invites i
    WHERE i.unit_id = home.unit_id AND i.invitee_email = lower(btrim(p_email))
      AND i.status = 'pending' AND i.expires_at > now()) THEN
    RAISE EXCEPTION 'household_invitation_already_pending' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.resident_household_invites(
    estate_id, unit_id, inviter_user_id, invitee_email, invitee_full_name
  ) VALUES (
    home.estate_id, home.unit_id, actor_id, lower(btrim(p_email)), btrim(p_full_name)
  ) RETURNING * INTO created_invite;

  RETURN QUERY SELECT created_invite.id, created_invite.estate_id, created_invite.unit_id,
    created_invite.invitee_email, created_invite.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.create_resident_household_invite(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_resident_household_invite(text,text) TO authenticated;

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
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resident_household_invites SET status = 'accepted', accepted_at = now()
  WHERE id = invite.id;
  INSERT INTO public.users(id, full_name, is_active)
  VALUES(actor_id, invite.invitee_full_name, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(nullif(public.users.full_name,''), EXCLUDED.full_name),
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

CREATE OR REPLACE FUNCTION public.get_my_household_members()
RETURNS TABLE(member_user_id uuid, member_name text, member_role text, invitation_email text, invitation_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  home_unit uuid;
  home_estate uuid;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  SELECT ru.unit_id, ru.estate_id INTO home_unit, home_estate
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id=ru.estate_id AND em.user_id=ru.resident_user_id
  WHERE ru.resident_user_id=actor_id AND ru.end_date IS NULL
    AND em.membership_role='resident' AND em.status='active'
  LIMIT 1;
  IF home_unit IS NULL THEN RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT ru.resident_user_id, u.full_name, 'resident'::text, NULL::text, NULL::timestamptz
  FROM public.resident_units ru
  JOIN public.users u ON u.id=ru.resident_user_id
  JOIN public.estate_memberships em ON em.estate_id=ru.estate_id AND em.user_id=ru.resident_user_id
  WHERE ru.unit_id=home_unit AND ru.estate_id=home_estate AND ru.end_date IS NULL
    AND em.membership_role='resident' AND em.status='active'
  UNION ALL
  SELECT NULL::uuid, 'Invitation pending'::text, 'pending'::text, i.invitee_email, i.expires_at
  FROM public.resident_household_invites i
  WHERE i.unit_id=home_unit AND i.estate_id=home_estate
    AND i.status='pending' AND i.expires_at > now()
  ORDER BY 3,2;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_household_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_household_members() TO authenticated;

CREATE TABLE IF NOT EXISTS public.resident_identity_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  id_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.resident_identity_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resident_identity_credentials FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_resident_identity()
RETURNS TABLE(id_code text, status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  result_row public.resident_identity_credentials%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_required_legal_consent() OR NOT private.is_account_access_enabled() THEN
    RAISE EXCEPTION 'account_or_legal_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.user_id=actor_id AND em.membership_role='resident' AND em.status='active'
  ) THEN RAISE EXCEPTION 'active_resident_required' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.resident_identity_credentials(user_id,id_code)
  VALUES(actor_id,'CBN-' || upper(replace(gen_random_uuid()::text,'-','')))
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO result_row FROM public.resident_identity_credentials ric
  WHERE ric.user_id=actor_id AND ric.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'resident_identity_unavailable' USING ERRCODE = 'P0002'; END IF;
  RETURN QUERY SELECT result_row.id_code,result_row.status,result_row.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_resident_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_resident_identity() TO authenticated;

-- Attach each service-charge payment to its apartment so both resident accounts
-- see one shared bill and only one successful/pending payment can exist per home.
ALTER TABLE public.service_charge_payments
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS service_charge_payments_unit_idx
  ON public.service_charge_payments(unit_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.assign_service_charge_payment_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE assigned_unit uuid;
BEGIN
  IF NEW.unit_id IS NULL THEN
    SELECT ru.unit_id INTO assigned_unit
    FROM public.resident_units ru
    WHERE ru.resident_user_id=NEW.resident_user_id
      AND ru.estate_id=NEW.estate_id AND ru.end_date IS NULL
    ORDER BY ru.created_at DESC LIMIT 1;
    NEW.unit_id := assigned_unit;
  END IF;
  IF NEW.unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.resident_units ru
    WHERE ru.unit_id=NEW.unit_id AND ru.resident_user_id=NEW.resident_user_id
      AND ru.estate_id=NEW.estate_id AND ru.end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'active_resident_apartment_required_for_payment' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assign_service_charge_payment_unit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS assign_service_charge_payment_unit ON public.service_charge_payments;
CREATE TRIGGER assign_service_charge_payment_unit
  BEFORE INSERT OR UPDATE OF resident_user_id, estate_id, unit_id
  ON public.service_charge_payments
  FOR EACH ROW EXECUTE FUNCTION private.assign_service_charge_payment_unit();

CREATE OR REPLACE FUNCTION private.guard_single_active_service_charge_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('pending','successful') THEN
    IF NEW.unit_id IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.charge_id::text || ':' || NEW.unit_id::text, 0)
      );
      IF EXISTS (
        SELECT 1 FROM public.service_charge_payments existing
        WHERE existing.charge_id=NEW.charge_id AND existing.unit_id=NEW.unit_id
          AND existing.id IS DISTINCT FROM NEW.id
          AND existing.status IN ('pending','successful')
      ) THEN
        RAISE EXCEPTION 'active_service_charge_payment_already_exists'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.charge_id::text || ':' || NEW.resident_user_id::text, 0)
      );
      IF EXISTS (
        SELECT 1 FROM public.service_charge_payments existing
        WHERE existing.charge_id=NEW.charge_id AND existing.resident_user_id=NEW.resident_user_id
          AND existing.id IS DISTINCT FROM NEW.id AND existing.status IN ('pending','successful')
      ) THEN
        RAISE EXCEPTION 'active_service_charge_payment_already_exists'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_single_active_service_charge_payment() FROM PUBLIC, anon, authenticated;
DROP INDEX IF EXISTS public.service_charge_payments_one_pending_attempt_idx;
CREATE UNIQUE INDEX IF NOT EXISTS service_charge_payments_one_active_attempt_per_unit_idx
  ON public.service_charge_payments(charge_id,unit_id)
  WHERE unit_id IS NOT NULL AND status IN ('pending','successful');
CREATE UNIQUE INDEX IF NOT EXISTS service_charge_payments_one_pending_attempt_legacy_idx
  ON public.service_charge_payments(charge_id,resident_user_id)
  WHERE unit_id IS NULL AND status='pending';

DROP POLICY IF EXISTS "Residents view own service charge payments" ON public.service_charge_payments;
CREATE POLICY "Residents view household service charge payments"
  ON public.service_charge_payments FOR SELECT TO authenticated
  USING (
    resident_user_id=(SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.unit_id=service_charge_payments.unit_id
        AND ru.resident_user_id=(SELECT auth.uid())
        AND ru.end_date IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.pay_service_charge_from_wallet(p_charge_id uuid)
RETURNS TABLE(payment_id uuid, wallet_transaction_id uuid, amount_kobo bigint, balance_kobo bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_unit_id uuid;
  v_estate_id uuid;
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
  SELECT ru.unit_id,ru.estate_id INTO v_unit_id,v_estate_id
  FROM public.resident_units ru
  JOIN public.estate_memberships em ON em.estate_id=ru.estate_id AND em.user_id=ru.resident_user_id
  WHERE ru.resident_user_id=v_user_id AND ru.end_date IS NULL
    AND em.membership_role='resident' AND em.status='active'
  ORDER BY ru.created_at DESC LIMIT 1;
  IF v_unit_id IS NULL THEN RAISE EXCEPTION 'active_resident_apartment_required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_charge FROM public.estate_service_charges
  WHERE id=p_charge_id AND estate_id=v_estate_id AND is_active=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_estate_charge_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.service_charge_payments p
    WHERE p.charge_id=p_charge_id AND p.unit_id=v_unit_id
      AND p.status IN ('pending','successful')) THEN
    RAISE EXCEPTION 'service_charge_payment_already_pending_or_paid' USING ERRCODE='23505';
  END IF;

  SELECT * INTO v_wallet FROM public.resident_wallets
  WHERE resident_user_id=v_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_wallet_not_found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(sum(CASE WHEN entry_type='credit' THEN amount_kobo ELSE -amount_kobo END),0)::bigint
  INTO v_balance FROM public.wallet_transactions
  WHERE wallet_id=v_wallet.id AND status='posted';
  IF v_balance < v_charge.amount_kobo THEN
    RAISE EXCEPTION 'insufficient_wallet_funds' USING ERRCODE='P0001';
  END IF;

  v_reference := 'CBNEST-WALLET-SERVICE-' || p_charge_id::text || '-' || v_unit_id::text;
  INSERT INTO public.wallet_transactions(
    wallet_id,resident_user_id,entry_type,amount_kobo,source,external_reference,description,metadata
  ) VALUES (
    v_wallet.id,v_user_id,'debit',v_charge.amount_kobo,'wallet_spend',v_reference,
    'Service charge payment',jsonb_build_object('charge_id',p_charge_id,'estate_id',v_estate_id,'unit_id',v_unit_id)
  ) RETURNING id INTO v_transaction_id;
  INSERT INTO public.service_charge_payments(
    charge_id,estate_id,resident_user_id,unit_id,amount_kobo,fee_kobo,total_amount_kobo,
    currency,status,provider,provider_reference,verified_at
  ) VALUES (
    p_charge_id,v_estate_id,v_user_id,v_unit_id,v_charge.amount_kobo,0,v_charge.amount_kobo,
    'NGN','successful','wallet',v_reference,now()
  ) RETURNING id INTO v_payment_id;
  v_balance := v_balance-v_charge.amount_kobo;
  RETURN QUERY SELECT v_payment_id,v_transaction_id,v_charge.amount_kobo,v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_service_charge_from_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_service_charge_from_wallet(uuid) TO authenticated;

COMMIT;
