import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { getBackgroundJobQueueMetrics } from "./background-job-monitor.js";

test("queue monitor returns aggregate metrics without selecting job payloads or errors", async () => {
  let statement = "";
  const rows = [{
    job_type: "email.send" as const,
    status: "queued" as const,
    job_count: 3,
    stale_running_count: 0,
    oldest_queued_at: "2026-11-10T12:00:00.000Z",
    failed_last_24_hours: 1,
  }];
  const database = {
    query: async (sql: string) => {
      statement = sql;
      return { rows };
    },
  } as unknown as Pool;

  const result = await getBackgroundJobQueueMetrics(database);
  assert.deepEqual(result, rows);
  assert.match(statement, /GROUP BY job_type, status/);
  assert.match(statement, /locked_at < now\(\) - interval '5 minutes'/);
  assert.match(statement, /updated_at >= now\(\) - interval '24 hours'/);
  assert.doesNotMatch(statement, /payload|last_error|locked_by/);
});
