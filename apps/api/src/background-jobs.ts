import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./storage.js";

export const BACKGROUND_JOB_TYPES = [
  "email.send",
  "notification.deliver",
  "report.generate",
] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];
export type BackgroundJob = {
  id: string;
  job_type: BackgroundJobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export type EnqueueBackgroundJobInput = {
  type: BackgroundJobType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
  availableAt?: Date;
};

function assertJobInput(input: EnqueueBackgroundJobInput): void {
  if (!BACKGROUND_JOB_TYPES.includes(input.type)) throw new TypeError("Unsupported background job type.");
  if (!input.payload || Array.isArray(input.payload) || typeof input.payload !== "object") {
    throw new TypeError("Background job payload must be an object.");
  }
  if (input.idempotencyKey !== undefined && (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200)) {
    throw new TypeError("Idempotency key must contain 1 to 200 characters.");
  }
  if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20)) {
    throw new TypeError("maxAttempts must be an integer from 1 to 20.");
  }
}

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput): Promise<{ id: string; inserted: boolean }> {
  assertJobInput(input);
  if (!pool) throw new Error("DATABASE_URL is required for background jobs.");
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.background_jobs (job_type, payload, idempotency_key, max_attempts, available_at)
     VALUES ($1, $2::jsonb, $3, $4, COALESCE($5::timestamptz, now()))
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [input.type, JSON.stringify(input.payload), input.idempotencyKey ?? null, input.maxAttempts ?? 8, input.availableAt?.toISOString() ?? null],
  );
  if (result.rows[0]) return { id: result.rows[0].id, inserted: true };
  if (!input.idempotencyKey) throw new Error("Background job insert did not return an ID.");
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM public.background_jobs WHERE idempotency_key = $1",
    [input.idempotencyKey],
  );
  if (!existing.rows[0]) throw new Error("Idempotent background job could not be retrieved.");
  return { id: existing.rows[0].id, inserted: false };
}

export async function claimBackgroundJobs(workerId = randomUUID(), limit = 10): Promise<BackgroundJob[]> {
  if (!pool) throw new Error("DATABASE_URL is required for background jobs.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RangeError("Worker batch size must be from 1 to 50.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Expired leases are returned to the queue; attempts are incremented only
    // when a worker claims a job, not when a lease expires.
    await client.query(
      `UPDATE public.background_jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
           locked_at = NULL, locked_by = NULL, updated_at = now(),
           last_error = COALESCE(last_error, 'Worker lease expired')
       WHERE status = 'running' AND locked_at < now() - interval '5 minutes'`,
    );
    const result = await client.query<BackgroundJob>(
      `WITH ready AS (
         SELECT id FROM public.background_jobs
         WHERE status = 'queued' AND available_at <= now()
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE public.background_jobs AS job
       SET status = 'running', attempts = job.attempts + 1,
           locked_at = now(), locked_by = $2, updated_at = now()
       FROM ready WHERE job.id = ready.id
       RETURNING job.id, job.job_type, job.payload, job.attempts, job.max_attempts`,
      [limit, workerId],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function completeBackgroundJob(jobId: string, workerId: string): Promise<boolean> {
  if (!pool) throw new Error("DATABASE_URL is required for background jobs.");
  const result = await pool.query(
    `UPDATE public.background_jobs
     SET status = 'completed', completed_at = now(), locked_at = NULL,
         locked_by = NULL, updated_at = now(), last_error = NULL
     WHERE id = $1 AND status = 'running' AND locked_by = $2`,
    [jobId, workerId],
  );
  return result.rowCount === 1;
}

export async function failBackgroundJob(job: BackgroundJob, workerId: string, error: unknown): Promise<"queued" | "failed"> {
  if (!pool) throw new Error("DATABASE_URL is required for background jobs.");
  const message = (error instanceof Error ? error.message : "Unknown worker error").slice(0, 1000);
  const result = await pool.query<{ status: "queued" | "failed" }>(
    `UPDATE public.background_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
         available_at = CASE WHEN attempts >= max_attempts THEN available_at
           ELSE now() + make_interval(secs => LEAST(3600, (15 * power(2, GREATEST(0, attempts - 1)))::integer)) END,
         locked_at = NULL, locked_by = NULL, last_error = $3, updated_at = now()
     WHERE id = $1 AND status = 'running' AND locked_by = $2
     RETURNING status`,
    [job.id, workerId, message],
  );
  if (!result.rows[0]) throw new Error("Job lease was lost before failure could be recorded.");
  return result.rows[0].status;
}

export type BackgroundJobHandler = (job: BackgroundJob) => Promise<void>;
export type BackgroundJobHandlers = Partial<Record<BackgroundJobType, BackgroundJobHandler>>;

// Exported for deterministic worker tests; handlers must be registered explicitly.
export async function processClaimedBackgroundJob(
  client: Pick<PoolClient, "query">,
  job: BackgroundJob,
  workerId: string,
  handlers: BackgroundJobHandlers,
): Promise<"completed" | "queued" | "failed"> {
  const handler = handlers[job.job_type];
  if (!handler) {
    const error = "No handler registered for background job type.";
    const status = job.attempts >= job.max_attempts ? "failed" : "queued";
    await client.query(
      `UPDATE public.background_jobs
       SET status = $3, locked_at = NULL, locked_by = NULL,
           last_error = $4, updated_at = now(),
           available_at = CASE WHEN $3 = 'queued' THEN now() + interval '5 minutes' ELSE available_at END
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
      [job.id, workerId, status, error],
    );
    return status;
  }
  await handler(job);
  const result = await client.query(
    `UPDATE public.background_jobs
     SET status = 'completed', completed_at = now(), locked_at = NULL,
         locked_by = NULL, last_error = NULL, updated_at = now()
     WHERE id = $1 AND status = 'running' AND locked_by = $2`,
    [job.id, workerId],
  );
  if (result.rowCount !== 1) throw new Error("Job lease was lost before completion.");
  return "completed";
}
