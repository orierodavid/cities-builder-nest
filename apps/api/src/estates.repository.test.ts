import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstatesForUser } from "./estates.repository.js";

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

test("platform administrators receive all RLS-visible estates with platform_admin membership role", async () => {
  const { client, calls } = mockClient([
    [{ role: "platform_admin" }],
    [{
      id: "estate-1", name: "Alpha Estate", address: "1 Road", city: "Lagos",
      state: "Lagos", timezone: "Africa/Lagos", is_enabled: true,
      disabled_at: null, disabled_reason: null,
    }],
  ]);
  const result = await getEstatesForUser(client, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values[0], "11111111-1111-4111-8111-111111111111");
  assert.match(calls[1].sql, /FROM public\.estates/);
  assert.doesNotMatch(calls[1].sql, /estate_memberships/);
  assert.equal(result.estates[0].membershipRole, "platform_admin");
  assert.equal(result.estates[0].name, "Alpha Estate");
});

test("non-platform users receive only active memberships and preserve estate role", async () => {
  const { client, calls } = mockClient([
    [{ role: "resident" }],
    [{
      id: "estate-2", name: "Beta Estate", address: "2 Road", city: "Lagos",
      state: "Lagos", timezone: "Africa/Lagos", is_enabled: true,
      disabled_at: null, disabled_reason: null, membership_role: "resident",
    }],
  ]);
  const result = await getEstatesForUser(client, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /m\.status = 'active'/);
  assert.equal(calls[1].values[0], "22222222-2222-4222-8222-222222222222");
  assert.equal(result.estates[0].membershipRole, "resident");
  assert.equal(result.estates[0].name, "Beta Estate");
});

test("users without roles or active memberships receive an empty estate list", async () => {
  const { client } = mockClient([[], []]);
  const result = await getEstatesForUser(client, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(result, { estates: [] });
});
