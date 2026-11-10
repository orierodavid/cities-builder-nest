import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getVisitorPassesForHost } from "./visitor-passes.repository.js";

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

const pass = (id: string) => ({
  id,
  estate_id: "estate-a",
  visitor_name: "Guest",
  visitor_phone: null,
  valid_from: "2026-11-10T10:00:00.000Z",
  valid_until: "2026-11-10T12:00:00.000Z",
  status: "active",
  created_at: "2026-11-10T09:00:00.000Z",
  access_code_ciphertext: "encrypted-value",
});

test("visitor pass repository scopes by estate and host and requests one look-ahead row", async () => {
  const { client, calls } = mockClient([pass("pass-1"), pass("pass-2"), pass("pass-3")]);
  const result = await getVisitorPassesForHost(client, "estate-a", "resident-1", 2, 4);

  assert.deepEqual(result, {
    visitorPasses: [pass("pass-1"), pass("pass-2")],
    hasMore: true,
  });
  assert.match(calls[0].sql, /FROM public\.visitor_passes/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /AND host_user_id = \$2/);
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["estate-a", "resident-1", 3, 4]);
});

test("visitor pass repository returns a short page without hasMore", async () => {
  const { client } = mockClient([pass("pass-1")]);
  const result = await getVisitorPassesForHost(client, "estate-a", "resident-1", 2, 0);
  assert.deepEqual(result, { visitorPasses: [pass("pass-1")], hasMore: false });
});

test("visitor pass repository handles an empty page", async () => {
  const { client, calls } = mockClient([]);
  const result = await getVisitorPassesForHost(client, "estate-a", "resident-1", 50, 0);
  assert.deepEqual(result, { visitorPasses: [], hasMore: false });
  assert.equal(calls.length, 1);
});
