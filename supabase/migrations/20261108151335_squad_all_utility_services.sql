BEGIN;
ALTER TABLE public.utility_validations DROP CONSTRAINT IF EXISTS utility_validations_service_check;
ALTER TABLE public.utility_validations ADD CONSTRAINT utility_validations_service_check CHECK (service IN ('electricity','cable_tv','education','internet','betting'));
ALTER TABLE public.utility_transactions DROP CONSTRAINT IF EXISTS utility_transactions_service_check;
ALTER TABLE public.utility_transactions ADD CONSTRAINT utility_transactions_service_check CHECK (service IN ('electricity','cable_tv','education','internet','betting'));
ALTER TABLE public.utility_transactions ADD COLUMN IF NOT EXISTS product_code text;
CREATE INDEX IF NOT EXISTS utility_transactions_service_resident_idx ON public.utility_transactions (resident_user_id, service, created_at DESC);
COMMIT;