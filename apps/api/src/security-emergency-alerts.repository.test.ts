import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getSecurityEmergencyAlerts } from "./security-emergency-alerts.repository.js";

function mockClient(rows: unknown[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows, rowCount: rows.length } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("emergency alert repository scopes to estate and orders newest first", async () => {
  const rows = [
    { id: "alert-1", estate_id: "estate-1", status: "active" },
    { id: "alert-2", estate_id: "estate-1", status: "resolved" },
    { id: "alert-3", estate_id: "estate-1", status: "active" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getSecurityEmergencyAlerts(client, "estate-1", 2, 5);
  assert.deepEqual(result, { alerts: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.security_emergency_alerts/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);
  assert.match(calls[0].sql, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 5]);
});

test("emergency alert repository returns short and empty pages", async () => {
  const rows = [{ id: "alert-1", estate_id: "estate-1" }];
  const first = mockClient(rows);
  assert.deepEqual(await getSecurityEmergencyAlerts(first.client, "estate-1", 10, 0), {
    alerts: rows, hasMore: false,
  });
  const empty = mockClient([]);
  assert.deepEqual(await getSecurityEmergencyAlerts(empty.client, "estate-1", 10, 0), {
    alerts: [], hasMore: false,
  });
});
