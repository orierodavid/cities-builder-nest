import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  getEstateEnabledStatus,
  getEstateMembershipAccess,
  getEventCreator,
  hasEstateManagerRole,
  hasPlatformAdminRole,
} from "./authorization.repository.js";

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

test("platform administrator lookup is scoped to the authenticated user and role", async () => {
  const { client, calls } = mockClient([[{ "?column?": 1 }]]);
  assert.equal(await hasPlatformAdminRole(client, "user-1"), true);
  assert.deepEqual(calls[0].values, ["user-1"]);
  assert.match(calls[0].sql, /FROM public\.user_roles/);
  assert.match(calls[0].sql, /role = 'platform_admin'/);
});

test("estate manager lookup restricts user, estate, active status and manager roles", async () => {
  const { client, calls } = mockClient([[{ "?column?": 1 }]]);
  assert.equal(await hasEstateManagerRole(client, "user-1", "estate-1"), true);
  assert.deepEqual(calls[0].values, ["estate-1", "user-1", ["facility_manager", "estate_manager", "estate_admin"]]);
  assert.match(calls[0].sql, /status = 'active'/);
  assert.match(calls[0].sql, /membership_role = ANY/);
});

test("estate membership lookup returns only the authenticated user's active membership", async () => {
  const membership = { estate_id: "estate-1", membership_role: "security", status: "active" };
  const { client, calls } = mockClient([[membership]]);
  assert.deepEqual(await getEstateMembershipAccess(client, "user-1", "estate-1"), membership);
  assert.deepEqual(calls[0].values, ["estate-1", "user-1"]);
  assert.match(calls[0].sql, /status = 'active'/);
});

test("estate enabled lookup distinguishes missing estate from disabled estate", async () => {
  const disabled = mockClient([[{ is_enabled: false }]]);
  assert.equal(await getEstateEnabledStatus(disabled.client, "estate-1"), false);
  const missing = mockClient([[]]);
  assert.equal(await getEstateEnabledStatus(missing.client, "estate-404"), null);
});

test("event creator lookup is scoped by both estate and event", async () => {
  const { client, calls } = mockClient([[{ created_by: "user-1" }]]);
  assert.equal(await getEventCreator(client, "estate-1", "event-1"), "user-1");
  assert.deepEqual(calls[0].values, ["estate-1", "event-1"]);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /AND id = \$2/);
});
