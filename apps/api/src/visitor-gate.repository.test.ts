import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { checkoutGateVisitorVisit, createGateVisitorVisit, getGateVisitorPass } from "./visitor-gate.repository.js";
function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult; } } as unknown as PoolClient;
  return { client, calls };
}
test("gate lookup scopes pass by estate and code hash", async () => {
  const pass = { id: "p1", host_user_id: "r1", visitor_name: "Guest", visitor_phone: null, valid_from: "from", valid_until: "until", status: "active" };
  const { client, calls } = mockClient([[pass]]);
  assert.deepEqual(await getGateVisitorPass(client, "e1", "hash"), pass);
  assert.deepEqual(calls[0].values, ["e1", "hash"]);
  assert.match(calls[0].sql, /WHERE estate_id = \$1 AND access_code_hash = \$2/);
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
