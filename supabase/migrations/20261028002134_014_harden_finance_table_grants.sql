-- Tighten grants on finance tables while payment-provider selection and server workflows remain pending.
-- RLS policies remain the row-level authorization boundary; grants are least-privilege defense in depth.

REVOKE ALL PRIVILEGES ON TABLE
  public.payment_intents,
  public.withdrawal_requests,
  public.ledger_transactions,
  public.ledger_entries,
  public.provider_events,
  public.reconciliation_runs,
  public.reconciliation_exceptions,
  public.audit_logs
FROM PUBLIC, anon, authenticated;

-- The provider catalog is not configured for public use. Authenticated users may
-- read only active partner rows through the existing RLS policy; no client writes.
REVOKE ALL PRIVILEGES ON TABLE public.financial_partners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_partners TO authenticated;

-- Residents can manage their own savings goals under the existing RLS policies.
-- Do not allow anonymous access or grant delete/truncate/administrative privileges.
REVOKE ALL PRIVILEGES ON TABLE public.rent_savings_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rent_savings_goals TO authenticated;
