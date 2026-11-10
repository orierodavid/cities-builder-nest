import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { checkoutGateVisitorVisit, createGateVisitorVisit, denyVisitorPass, getGateVisitorPass } from "./visitor-gate.repository.js";
function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as unknown as QueryResult; } } as unknown as PoolClient;
  return { client, calls };
}
test("gate lookup returns the pass and host display name through the scoped security function", async () => {
  const pass = { id: "p1", host_user_id: "r1", visitor_name: "Guest", visitor_phone: null, valid_from: "from", valid_until: "until", status: "active", host_full_name: "Resident One" };
  const { client, calls } = mockClient([[pass]]);
  assert.deepEqual(await getGateVisitorPass(client, "e1", "hash"), pass);
  assert.deepEqual(calls[0].values, ["e1", "hash"]);
  assert.match(calls[0].sql, /get_gate_visitor_pass_for_security/);
});
test("gate check-in inserts through database lifecycle triggers", async () => {
  const visit = { id: "v1", visitor_pass_id: "p1", checked_in_at: "now" };
  const { client, calls } = mockClient([[visit]]);
  assert.deepEqual(await createGateVisitorVisit(client, { estateId: "e1", visitorPassId: "p1", checkedInBy: "s1" }), visit);
  assert.deepEqual(calls[0].values, ["e1", "p1", "s1"]);
  assert.match(calls[0].sql, /INSERT INTO public\.visitor_visits/);
});
test("checkout is estate-scoped and only closes open visits", async () => {
  const visit = { id: "v1", checked_in_at: "start", checked_out_at: "end" };
  const { client, calls } = mockClient([[visit]]);
  assert.deepEqual(await checkoutGateVisitorVisit(client, { estateId: "e1", visitId: "v1", checkedOutBy: "s1", checkedOutAt: "end" }), visit);
  assert.deepEqual(calls[0].values, ["v1", "e1", "s1", "end"]);
  assert.match(calls[0].sql, /checked_out_at IS NULL/);
});
test("visitor pass denial delegates status change and audit insertion to one database transaction", async () => {
  const outcome = { result: "denied" as const, pass_id: "p1", pass_status: "revoked" };
  const { client, calls } = mockClient([[outcome]]);
  assert.deepEqual(await denyVisitorPass(client, { estateId: "e1", passId: "p1", reason: "No valid authorisation" }), outcome);
  assert.match(calls[0].sql, /deny_visitor_pass_for_security/);
  assert.deepEqual(calls[0].values, ["e1", "p1", "No valid authorisation"]);
});
