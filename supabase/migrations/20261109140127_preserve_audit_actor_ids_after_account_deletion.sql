alter table public.audit_logs
  drop constraint if exists audit_logs_actor_user_id_fkey;