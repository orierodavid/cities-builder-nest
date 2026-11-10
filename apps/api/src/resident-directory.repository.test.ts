import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getResidentsForEstate } from "./resident-directory.repository.js";

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

test("resident directory pages active resident memberships then alphabetizes visible profiles", async () => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const { client, calls } = mockClient([
    [{ user_id: userB }, { user_id: userA }, { user_id: userB }],
    [
      { id: userA, full_name: "Ada Resident", phone_e164: null },
      { id: userB, full_name: "Bola Resident", phone_e164: "+2348000000000" },
    ],
  ]);

  const result = await getResidentsForEstate(client, "estate-1", 2, 10);
  assert.deepEqual(result, {
    residents: [
      { id: userA, full_name: "Ada Resident", phone_e164: null },
      { id: userB, full_name: "Bola Resident", phone_e164: "+2348000000000" },
    ],
    hasMore: true,
  });
  assert.match(calls[0].sql, /FROM public\.estate_memberships/);
  assert.match(calls[0].sql, /membership_role = 'resident'/);
  assert.match(calls[0].sql, /status = 'active'/);
  assert.match(calls[0].sql, /ORDER BY created_at ASC/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 10]);
  assert.match(calls[1].sql, /FROM public\.users/);
  assert.match(calls[1].sql, /id = ANY\(\$1::uuid\[\]\)/);
  assert.match(calls[1].sql, /ORDER BY full_name ASC/);
  assert.deepEqual(calls[1].values, [[userB, userA]]);
});

test("resident directory avoids a profile query when the page has no memberships", async () => {
  const { client, calls } = mockClient([[]]);
  assert.deepEqual(await getResidentsForEstate(client, "estate-1", 50, 0), {
    residents: [],
    hasMore: false,
  });
  assert.equal(calls.length, 1);
});

test("resident directory reports hasMore from the membership look-ahead row", async () => {
  const { client } = mockClient([
    [{ user_id: "11111111-1111-4111-8111-111111111111" }, { user_id: "22222222-2222-4222-8222-222222222222" }],
    [{ id: "11111111-1111-4111-8111-111111111111", full_name: "Resident", phone_e164: null }],
  ]);
  const result = await getResidentsForEstate(client, "estate-1", 1, 0);
  assert.equal(result.hasMore, true);
  assert.equal(result.residents.length, 1);
});
