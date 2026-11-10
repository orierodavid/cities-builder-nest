import type { Pool } from "pg";

export interface BackgroundJobQueueMetric {
  job_type: "email.send" | "notification.deliver" | "report.generate";
  status: "queued" | "running" | "completed" | "failed";
  job_count: number;
  stale_running_count: number;
  oldest_queued_at: string | null;
  failed_last_24_hours: number;
}

/** Return aggregate queue health only; never expose job payloads or error text. */
export async function getBackgroundJobQueueMetrics(database: Pool): Promise<BackgroundJobQueueMetric[]> {
  const result = await database.query<BackgroundJobQueueMetric>(
    `SELECT
       job_type,
       status,
       count(*)::int AS job_count,
       count(*) FILTER (
         WHERE status = 'running'
           AND locked_at < now() - interval '5 minutes'
       )::int AS stale_running_count,
       min(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
       count(*) FILTER (
         WHERE status = 'failed'
           AND updated_at >= now() - interval '24 hours'
       )::int AS failed_last_24_hours
     FROM public.background_jobs
     GROUP BY job_type, status
     ORDER BY job_type, status`,
  );
  return result.rows;
}
