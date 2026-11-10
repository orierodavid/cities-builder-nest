import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  acknowledgeSecurityShiftHandover,
  createSecurityIncident,
  createSecurityShiftHandover,
} from "./security-workflows.repository.js";

function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("security shift handover creation records authenticated outgoing officer and pending state", async () => {
  const row = { id: "h1", estate_id: "e1", outgoing_officer: "u1", shift_label: "Night", shift_started_at: "start", shift_ended_at: "end", handover_notes: "Important handover notes", pending_actions: null, status: "pending", created_at: "now" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await createSecurityShiftHandover(client, { estateId: "e1", userId: "u1", shiftLabel: "Night", shiftStartedAt: "start", shiftEndedAt: "end", handoverNotes: "Important handover notes", pendingActions: null }), row);
  assert.deepEqual(calls[0].values, ["e1", "u1", "Night", "start", "end", "Important handover notes", null]);
  assert.match(calls[0].sql, /INSERT INTO public\.security_shift_handovers/);
  assert.match(calls[0].sql, /'pending'/);
});

test("handover acknowledgement is estate-scoped, pending-only and prevents self-acknowledgement", async () => {
  const row = { id: "h1", estate_id: "e1", status: "acknowledged", acknowledged_by: "u2", acknowledged_at: "now" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await acknowledgeSecurityShiftHandover(client, { estateId: "e1", handoverId: "h1", userId: "u2", acknowledgedAt: "now" }), row);
  assert.deepEqual(calls[0].values, ["h1", "e1", "u2", "now"]);
  assert.match(calls[0].sql, /status = 'pending'/);
  assert.match(calls[0].sql, /outgoing_officer <> \$3/);
});

test("incident creation records the authenticated reporter and open state", async () => {
  const row = { id: "i1", estate_id: "e1", reported_by: "u1", title: "Incident", category: "theft", severity: "medium", description: "A sufficiently detailed incident report", location: null, occurred_at: "now", status: "open", created_at: "now" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await createSecurityIncident(client, { estateId: "e1", userId: "u1", title: "Incident", category: "theft", severity: "medium", description: "A sufficiently detailed incident report", location: null, occurredAt: "now" }), row);
  assert.deepEqual(calls[0].values, ["e1", "u1", "Incident", "theft", "medium", "A sufficiently detailed incident report", null, "now"]);
  assert.match(calls[0].sql, /INSERT INTO public\.security_incident_reports/);
  assert.match(calls[0].sql, /'open'/);
});
