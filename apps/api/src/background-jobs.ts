import { randomUUID } from "node:crypto";
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

export function isBackgroundJobType(value: unknown): value is BackgroundJobType {
  return typeof value === "string" && (BACKGROUND_JOB_TYPES as readonly string[]).includes(value);
}

export function backgroundJobRetryDelaySeconds(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError("Attempts must be a positive integer.");
  }
  return Math.min(3600, 15 * 2 ** Math.min(20, attempts - 1));
}

export function validateEnqueueBackgroundJobInput(input: EnqueueBackgroundJobInput): void {
  if (!isBackgroundJobType(input.type)) throw new TypeError("Unsupported background job type.");
  if (!input.payload || Array.isArray(input.payload) || typeof input.payload !== "object") {
    throw new TypeError("Background job payload must be an object.");
  }
  if (input.idempotencyKey !== undefined && (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200)) {
    throw new TypeError("Idempotency key must contain 1 to 200 characters.");
  }
  if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20)) {
    throw new TypeError("maxAttempts must be an integer from 1 to 20.");
  }
  if (input.availableAt !== undefined && Number.isNaN(input.availableAt.getTime())) {
    throw new TypeError("availableAt must be a valid date.");
  }
}

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput): Promise<{ id: string; inserted: boolean }> {
  validateEnqueueBackgroundJobInput(input);
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

export async function claimBackgroundJobs(
  workerId = randomUUID(),
  limit = 10,
  jobTypes?: readonly BackgroundJobType[],
): Promise<BackgroundJob[]> {
  if (!pool) throw new Error("DATABASE_URL is required for background jobs.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RangeError("Worker batch size must be from 1 to 50.");
  if (jobTypes && (jobTypes.length === 0 || jobTypes.some((type) => !isBackgroundJobType(type)))) {
    throw new TypeError("Worker job types must be a non-empty list of supported types.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
           AND ($3::text[] IS NULL OR job_type = ANY($3::text[]))
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE public.background_jobs AS job
       SET status = 'running', attempts = job.attempts + 1,
           locked_at = now(), locked_by = $2, updated_at = now()
       FROM ready WHERE job.id = ready.id
       RETURNING job.id, job.job_type, job.payload, job.attempts, job.max_attempts`,
      [limit, workerId, jobTypes ?? null],
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
           ELSE now() + make_interval(secs => $4) END,
         locked_at = NULL, locked_by = NULL, last_error = $3, updated_at = now()
     WHERE id = $1 AND status = 'running' AND locked_by = $2
     RETURNING status`,
    [job.id, workerId, message, backgroundJobRetryDelaySeconds(job.attempts)],
  );
  if (!result.rows[0]) throw new Error("Job lease was lost before failure could be recorded.");
  return result.rows[0].status;
}

export type BackgroundJobHandler = (job: BackgroundJob) => Promise<void>;
export type BackgroundJobHandlers = Partial<Record<BackgroundJobType, BackgroundJobHandler>>;

export async function processClaimedBackgroundJob(
  job: BackgroundJob,
  workerId: string,
  handlers: BackgroundJobHandlers,
): Promise<"completed" | "queued" | "failed"> {
  const handler = handlers[job.job_type];
  if (!handler) return failBackgroundJob(job, workerId, new Error("No handler registered for background job type."));
  try {
    await handler(job);
    const completed = await completeBackgroundJob(job.id, workerId);
    if (!completed) throw new Error("Job lease was lost before completion.");
    return "completed";
  } catch (error) {
    return failBackgroundJob(job, workerId, error);
  }
}
