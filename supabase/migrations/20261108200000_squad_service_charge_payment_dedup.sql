-- Prevent concurrent checkout attempts from creating multiple payable rows
-- for the same resident/charge. Failed attempts remain retryable.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_charge_payments
    WHERE status IN ('pending', 'successful')
    GROUP BY charge_id, resident_user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'duplicate_active_service_charge_payments_require_reconciliation_before_dedup_index';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS service_charge_payments_one_active_attempt_idx
  ON public.service_charge_payments(charge_id, resident_user_id)
  WHERE status IN ('pending', 'successful');

COMMIT;
