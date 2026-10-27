-- Cities Builder Nest: cover existing foreign-key lookup paths.
-- These indexes are expected to show as unused until the application has real traffic.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_announcements_created_by_fk ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_estate_fk ON public.announcements (estate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_fk ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_goal_fk ON public.ledger_transactions (goal_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_assigned_to_fk ON public.maintenance_requests (assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_created_by_fk ON public.maintenance_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_intents_goal_fk ON public.payment_intents (goal_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_partner_fk ON public.payment_intents (partner_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_resolved_by_fk ON public.reconciliation_exceptions (resolved_by);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_run_fk ON public.reconciliation_exceptions (run_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_partner_fk ON public.reconciliation_runs (partner_id);
CREATE INDEX IF NOT EXISTS idx_rent_savings_goals_estate_fk ON public.rent_savings_goals (estate_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by_fk ON public.user_roles (assigned_by);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_host_fk ON public.visitor_passes (host_user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_goal_fk ON public.withdrawal_requests (goal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_partner_fk ON public.withdrawal_requests (partner_id);
COMMIT;
