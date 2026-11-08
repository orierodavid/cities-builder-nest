BEGIN;

CREATE TABLE IF NOT EXISTS public.utility_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE RESTRICT,
  service text NOT NULL CHECK (service IN ('electricity','cable_tv')),
  provider text NOT NULL,
  customer_identifier text NOT NULL,
  meter_type text CHECK (meter_type IS NULL OR meter_type IN ('prepaid','postpaid')),
  validation_token text NOT NULL,
  customer_name text,
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','used','expired','failed')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS utility_validations_owner_idx
  ON public.utility_validations (resident_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS utility_validations_expiry_idx
  ON public.utility_validations (expires_at)
  WHERE status = 'validated';

CREATE TABLE IF NOT EXISTS public.utility_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE RESTRICT,
  validation_id uuid NOT NULL REFERENCES public.utility_validations(id) ON DELETE RESTRICT,
  service text NOT NULL CHECK (service IN ('electricity','cable_tv')),
  provider text NOT NULL,
  customer_identifier text NOT NULL,
  merchant_reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL CHECK (status IN ('pending','successful','failed')),
  provider_status text,
  provider_response jsonb,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS utility_transactions_resident_idx
  ON public.utility_transactions (resident_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS utility_transactions_estate_idx
  ON public.utility_transactions (estate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS utility_transactions_pending_idx
  ON public.utility_transactions (created_at)
  WHERE status = 'pending';

ALTER TABLE public.utility_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.utility_validations FROM anon, authenticated;
REVOKE ALL ON public.utility_transactions FROM anon, authenticated;
GRANT ALL ON public.utility_validations TO service_role;
GRANT ALL ON public.utility_transactions TO service_role;

COMMIT;
