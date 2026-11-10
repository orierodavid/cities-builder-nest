BEGIN;

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('email.send', 'notification.deliver', 'report.generate')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT background_jobs_lock_state_check CHECK (
    (status = 'running' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR (status <> 'running' AND locked_at IS NULL AND locked_by IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_idempotency_key_uidx
  ON public.background_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS background_jobs_ready_idx
  ON public.background_jobs (available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS background_jobs_expired_lease_idx
  ON public.background_jobs (locked_at)
  WHERE status = 'running';

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.background_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.background_jobs TO service_role;

COMMENT ON TABLE public.background_jobs IS
  'Durable internal work queue. Payloads must contain identifiers, not credentials or payment secrets.';

COMMIT;
