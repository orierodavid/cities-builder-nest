import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateDashboard } from "./dashboard.repository.js";

function createClient(rows: unknown[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows, rowCount: rows.length } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

const dashboardRow = {
  id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos",
  timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null,
  membership_role: "facility_manager", units: 20, occupied_units: 12,
  open_maintenance_requests: 2, published_announcements: 4,
  announcements: [{ id: "a1", title: "Notice", body: "Body", published_at: "2026-01-01", created_at: "2026-01-01" }],
  maintenance_requests: [{ id: "m1", title: "Leak", status: "open", priority: "high", created_at: "2026-01-02" }],
};

test("estate dashboard uses one scoped query for access, counts and previews", async () => {
  const { client, calls } = createClient([dashboardRow]);
  const result = await getEstateDashboard(client, "u1", "e1");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ["u1", "e1"]);
  assert.match(calls[0].sql, /role = 'platform_admin'/);
  assert.match(calls[0].sql, /status = 'active'/);
  assert.match(calls[0].sql, /m.membership_role IS NOT NULL OR r.is_platform_admin/);
  assert.match(calls[0].sql, /FROM public.units/);
  assert.match(calls[0].sql, /FROM public.maintenance_requests/);
  assert.match(calls[0].sql, /FROM public.announcements/);
  assert.match(calls[0].sql, /LIMIT 3/);
  assert.match(calls[0].sql, /LIMIT 5/);
  assert.equal(result.estate?.membershipRole, "facility_manager");
  assert.deepEqual(result.summary, {
    units: 20, occupiedUnits: 12, openMaintenanceRequests: 2, publishedAnnouncements: 4,
  });
  assert.equal(result.announcements.length, 1);
  assert.equal(result.maintenanceRequests.length, 1);
  assert.equal(result.membershipFound, true);
});

test("estate dashboard permits a platform administrator without an estate membership", async () => {
  const { client } = createClient([{ ...dashboardRow, membership_role: "platform_admin" }]);
  const result = await getEstateDashboard(client, "admin", "e1");
  assert.equal(result.estate?.membershipRole, "platform_admin");
  assert.equal(result.membershipFound, false);
});

test("estate dashboard denies users without an active membership or platform role", async () => {
  const { client, calls } = createClient([]);
  const result = await getEstateDashboard(client, "outsider", "e1");
  assert.equal(result.estate, null);
  assert.equal(result.membershipFound, false);
  assert.deepEqual(result.summary, {
    units: 0, occupiedUnits: 0, openMaintenanceRequests: 0, publishedAnnouncements: 0,
  });
  assert.deepEqual(result.announcements, []);
  assert.deepEqual(result.maintenanceRequests, []);
  assert.equal(calls.length, 1);
});
