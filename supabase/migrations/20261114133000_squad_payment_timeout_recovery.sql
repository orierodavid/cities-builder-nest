BEGIN;

-- Prevent repeated taps/retries from creating a second pending contribution
-- for the same resident, savings goal and amount.
CREATE UNIQUE INDEX IF NOT EXISTS rent_savings_contributions_one_pending_attempt_idx
  ON public.rent_savings_contributions (goal_id, resident_user_id, amount_kobo)
  WHERE status = 'pending';

-- Keep unresolved failed records eligible for provider verification. Older
-- deployments may have marked an ambiguous network timeout as failed.
CREATE INDEX IF NOT EXISTS service_charge_payments_unverified_reconciliation_idx
  ON public.service_charge_payments (status, last_reconciled_at, created_at)
  WHERE status IN ('pending', 'failed') AND verified_at IS NULL;

CREATE INDEX IF NOT EXISTS rent_savings_contributions_unverified_reconciliation_idx
  ON public.rent_savings_contributions (status, last_reconciled_at, created_at)
  WHERE status IN ('pending', 'failed') AND verified_at IS NULL;

CREATE INDEX IF NOT EXISTS utility_transactions_pending_reconciliation_idx
  ON public.utility_transactions (last_reconciled_at, created_at)
  WHERE status = 'pending';

COMMIT;
