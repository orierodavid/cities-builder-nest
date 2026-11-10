import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateDashboard } from "./dashboard.repository.js";

function createClient(responses: unknown[][]) {
  let call = 0;
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: responses[call++] ?? [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("estate dashboard repository returns scoped dashboard data and membership role", async () => {
  const { client, calls } = createClient([
    [{ role: "facility_manager" }],
    [{ membership_role: "facility_manager" }],
    [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
    [{ id: "a1", title: "Notice", body: "Body", published_at: "2026-01-01", created_at: "2026-01-01" }],
    [{ count: "4" }],
    [{ id: "m1", title: "Leak", status: "open", priority: "high", created_at: "2026-01-02" }],
    [{ count: "2" }],
    [{ count: "20" }],
    [{ count: "12" }],
  ]);
  const result = await getEstateDashboard(client, "u1", "e1");
  assert.equal(calls.length, 9);
  assert.ok(calls.every((call) => call.values[0] === "u1" || call.values[0] === "e1"));
  assert.equal(result.estate?.membershipRole, "facility_manager");
  assert.deepEqual(result.summary, { units: 20, occupiedUnits: 12, openMaintenanceRequests: 2, publishedAnnouncements: 4 });
  assert.equal(result.announcements.length, 1);
  assert.equal(result.maintenanceRequests.length, 1);
});

test("estate dashboard allows a platform administrator without an estate membership", async () => {
  const { client } = createClient([
    [{ role: "platform_admin" }], [],
    [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
    [], [{ count: "0" }], [], [{ count: "0" }], [{ count: "0" }], [{ count: "0" }],
  ]);
  const result = await getEstateDashboard(client, "admin", "e1");
  assert.equal(result.estate?.membershipRole, "platform_admin");
});

test("estate dashboard denies users without membership or platform role", async () => {
  const { client } = createClient([
    [], [],
    [{ id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null }],
    [], [{ count: "0" }], [], [{ count: "0" }], [{ count: "0" }], [{ count: "0" }],
  ]);
  const result = await getEstateDashboard(client, "outsider", "e1");
  assert.equal(result.estate, null);
  assert.equal(result.membershipFound, false);
});
