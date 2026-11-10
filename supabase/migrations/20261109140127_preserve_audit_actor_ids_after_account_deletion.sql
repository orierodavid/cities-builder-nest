-- Preserve immutable actor identifiers in append-only audit history after account deletion.
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
