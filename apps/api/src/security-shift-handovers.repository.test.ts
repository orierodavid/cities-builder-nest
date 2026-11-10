import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getSecurityShiftHandovers } from "./security-shift-handovers.repository.js";

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

test("security handover repository scopes to estate and orders newest first", async () => {
  const rows = [
    { id: "handover-1", estate_id: "estate-1", status: "pending" },
    { id: "handover-2", estate_id: "estate-1", status: "acknowledged" },
    { id: "handover-3", estate_id: "estate-1", status: "pending" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getSecurityShiftHandovers(client, "estate-1", 2, 10);

  assert.deepEqual(result, { handovers: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.security_shift_handovers/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);
  assert.match(calls[0].sql, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 10]);
});

test("security handover repository returns a short final page", async () => {
  const rows = [{ id: "handover-1", estate_id: "estate-1" }];
  const { client } = mockClient(rows);
  const result = await getSecurityShiftHandovers(client, "estate-1", 20, 0);
  assert.deepEqual(result, { handovers: rows, hasMore: false });
});

test("security handover repository returns an empty page without fabricating records", async () => {
  const { client } = mockClient([]);
  assert.deepEqual(await getSecurityShiftHandovers(client, "estate-1", 20, 0), {
    handovers: [],
    hasMore: false,
  });
});
