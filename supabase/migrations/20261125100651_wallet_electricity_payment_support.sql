-- Record electricity wallet settlement state and expose a service-role-only debit boundary.
ALTER TABLE public.utility_transactions
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'external'
    CHECK (payment_method IN ('external','wallet')),
  ADD COLUMN IF NOT EXISTS wallet_debit_reference text UNIQUE;

CREATE OR REPLACE FUNCTION public.post_wallet_debit_for_electricity(
  p_resident_user_id uuid, p_amount_kobo bigint, p_external_reference text,
  p_description text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  RETURN private.post_wallet_debit(
    p_resident_user_id,p_amount_kobo,'wallet_spend',p_external_reference,
    p_description,p_metadata
  );
END;
$$;
REVOKE ALL ON FUNCTION public.post_wallet_debit_for_electricity(uuid,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_debit_for_electricity(uuid,bigint,text,text,jsonb) TO service_role;
