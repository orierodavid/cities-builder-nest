-- Serialize service-charge payment attempts for each resident/charge pair.
-- Existing successful + pending duplicates are preserved for provider reconciliation;
-- the guard prevents any further payable attempt for that pair until resolved.
BEGIN;

CREATE OR REPLACE FUNCTION private.guard_single_active_service_charge_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('pending', 'successful') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.charge_id::text || ':' || NEW.resident_user_id::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.service_charge_payments existing
      WHERE existing.charge_id = NEW.charge_id
        AND existing.resident_user_id = NEW.resident_user_id
        AND existing.id IS DISTINCT FROM NEW.id
        AND existing.status IN ('pending', 'successful')
    ) THEN
      RAISE EXCEPTION 'active_service_charge_payment_already_exists'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_single_active_service_charge_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_single_active_service_charge_payment
  ON public.service_charge_payments;
CREATE TRIGGER guard_single_active_service_charge_payment
  BEFORE INSERT OR UPDATE OF charge_id, resident_user_id, status
  ON public.service_charge_payments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_single_active_service_charge_payment();

CREATE UNIQUE INDEX IF NOT EXISTS service_charge_payments_one_pending_attempt_idx
  ON public.service_charge_payments(charge_id, resident_user_id)
  WHERE status = 'pending';

COMMIT;