import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { publishSecurityEmergencyAlert, resolveSecurityEmergencyAlert } from "./security-emergency-alert-mutations.repository.js";

function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult; } } as unknown as PoolClient;
  return { client, calls };
}

test("emergency alert publishing calls the database-owned notification workflow", async () => {
  const payload = { alert: { id: "a1", estate_id: "e1", status: "active" }, notificationId: "n1", recipientCount: 12 };
  const { client, calls } = mockClient([[{ result: payload }]]);
  assert.deepEqual(await publishSecurityEmergencyAlert(client, { estateId: "e1", alertType: "fire", severity: "critical", title: "Fire", message: "Fire reported at the main gate", location: null }), payload);
  assert.deepEqual(calls[0].values, ["e1", "fire", "critical", "Fire", "Fire reported at the main gate", null]);
  assert.match(calls[0].sql, /public\.publish_security_emergency_alert/);
});

test("emergency alert resolution is estate-scoped and active-only", async () => {
  const row = { id: "a1", estate_id: "e1", title: "Fire", status: "resolved", resolved_by: "s1", resolved_at: "now" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await resolveSecurityEmergencyAlert(client, { estateId: "e1", alertId: "a1", userId: "s1", resolvedAt: "now" }), row);
  assert.deepEqual(calls[0].values, ["a1", "e1", "s1", "now"]);
  assert.match(calls[0].sql, /status = 'active'/);
});
