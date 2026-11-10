BEGIN;

-- Record the last provider reconciliation attempt so a scheduled sweep can
-- retry unresolved transactions without repeatedly querying the oldest rows.
ALTER TABLE public.service_charge_payments
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
ALTER TABLE public.rent_savings_contributions
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

CREATE INDEX IF NOT EXISTS service_charge_payments_pending_reconciliation_idx
  ON public.service_charge_payments (last_reconciled_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS rent_savings_contributions_pending_reconciliation_idx
  ON public.rent_savings_contributions (last_reconciled_at, created_at)
  WHERE status = 'pending';

COMMIT;
