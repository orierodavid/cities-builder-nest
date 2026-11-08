BEGIN;
ALTER TABLE public.utility_validations
  ADD COLUMN IF NOT EXISTS minimum_vend numeric(14,2);
COMMIT;
