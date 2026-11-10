-- Squad checkout transaction ledger for resident rent savings and estate service charges.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rent_savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.rent_savings_goals(id) ON DELETE RESTRICT,
  resident_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','successful','failed','reversed')),
  provider text NOT NULL DEFAULT 'squad',
  provider_reference text NOT NULL UNIQUE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rent_savings_contributions_goal_idx
  ON public.rent_savings_contributions(goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rent_savings_contributions_resident_idx
  ON public.rent_savings_contributions(resident_user_id, created_at DESC);

ALTER TABLE public.rent_savings_contributions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.rent_savings_contributions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rent_savings_contributions FROM anon, authenticated;
GRANT ALL ON public.rent_savings_contributions TO service_role;

DROP POLICY IF EXISTS "Residents view own rent savings contributions" ON public.rent_savings_contributions;
CREATE POLICY "Residents view own rent savings contributions"
  ON public.rent_savings_contributions FOR SELECT TO authenticated
  USING (resident_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Managers view estate rent savings contributions" ON public.rent_savings_contributions;
CREATE POLICY "Managers view estate rent savings contributions"
  ON public.rent_savings_contributions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estate_memberships em
    WHERE em.estate_id = rent_savings_contributions.estate_id
      AND em.user_id = (SELECT auth.uid())
      AND em.status = 'active'
      AND em.membership_role IN ('facility_manager','estate_manager','estate_admin')
  ));

-- Service-charge payment ledger remains server-write-only; record Squad as provider.
ALTER TABLE public.service_charge_payments
  ALTER COLUMN provider SET DEFAULT 'squad';

COMMIT;
