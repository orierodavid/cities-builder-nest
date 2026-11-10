import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getBuildingsForEstate, getUnitsForEstate } from "./property-directory.repository.js";

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

test("building directory keeps estate scope, alphabetical order and look-ahead pagination", async () => {
  const rows = [
    { id: "b1", estate_id: "estate-1", name: "A Block", created_at: "2026-01-01" },
    { id: "b2", estate_id: "estate-1", name: "B Block", created_at: "2026-01-02" },
    { id: "b3", estate_id: "estate-1", name: "C Block", created_at: "2026-01-03" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getBuildingsForEstate(client, "estate-1", 2, 4);

  assert.deepEqual(result, { items: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.buildings/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY name ASC/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 4]);
});

test("unit directory keeps estate scope, unit-code order and look-ahead pagination", async () => {
  const rows = [
    { id: "u1", estate_id: "estate-1", building_id: "b1", unit_code: "A01", unit_type: null, status: "available" },
    { id: "u2", estate_id: "estate-1", building_id: "b1", unit_code: "A02", unit_type: "flat", status: "occupied" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getUnitsForEstate(client, "estate-1", 2, 0);

  assert.deepEqual(result, { items: rows, hasMore: false });
  assert.match(calls[0].sql, /FROM public\.units/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY unit_code ASC/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 0]);
});

test("empty property directories return no items and no next page", async () => {
  const { client } = mockClient([]);
  assert.deepEqual(await getBuildingsForEstate(client, "estate-1", 50, 0), { items: [], hasMore: false });
  assert.deepEqual(await getUnitsForEstate(client, "estate-1", 50, 0), { items: [], hasMore: false });
});
