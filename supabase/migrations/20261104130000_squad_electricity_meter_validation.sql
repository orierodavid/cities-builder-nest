BEGIN;
CREATE TABLE IF NOT EXISTS public.electricity_meter_validations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resident_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE RESTRICT,
 disco_code text NOT NULL CHECK (char_length(disco_code) BETWEEN 2 AND 20),
 meter_number text NOT NULL CHECK (meter_number ~ '^[0-9]{6,20}$'),
 meter_type text NOT NULL CHECK (meter_type IN ('prepaid','postpaid')),
 provider_reference text NOT NULL,
 customer_name text,
 customer_address text,
 minimum_vend numeric(14,2),
 account_type text,
 outstanding_debt numeric(14,2),
 status text NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','used','expired','failed')),
 validated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (resident_user_id, provider_reference)
);
CREATE INDEX IF NOT EXISTS electricity_meter_validations_resident_idx ON public.electricity_meter_validations(resident_user_id, created_at DESC);
ALTER TABLE public.electricity_meter_validations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.electricity_meter_validations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.electricity_meter_validations FROM anon, authenticated;
GRANT ALL ON public.electricity_meter_validations TO service_role;
DROP POLICY IF EXISTS "Residents view own electricity meter validations" ON public.electricity_meter_validations;
CREATE POLICY "Residents view own electricity meter validations" ON public.electricity_meter_validations FOR SELECT TO authenticated USING (resident_user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Managers view estate electricity meter validations" ON public.electricity_meter_validations;
CREATE POLICY "Managers view estate electricity meter validations" ON public.electricity_meter_validations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.estate_memberships em WHERE em.estate_id = electricity_meter_validations.estate_id AND em.user_id = (SELECT auth.uid()) AND em.status = 'active' AND em.membership_role IN ('facility_manager','estate_manager','estate_admin')));
COMMIT;
