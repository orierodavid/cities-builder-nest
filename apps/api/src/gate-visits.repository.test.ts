import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getActiveGateVisitsForEstate } from "./gate-visits.repository.js";

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

const visit = (id: string) => ({
  id,
  visitor_pass_id: `pass-${id}`,
  checked_in_at: "2026-11-10T09:00:00.000Z",
  visitor_passes: { visitor_name: "Visitor", visitor_phone: null },
});

test("active gate visits are estate-scoped, exclude checked-out visits, and use newest-first pagination", async () => {
  const { client, calls } = mockClient([visit("1"), visit("2"), visit("3")]);
  const result = await getActiveGateVisitsForEstate(client, "estate-a", 2, 6);

  assert.deepEqual(result, {
    visits: [visit("1"), visit("2")],
    hasMore: true,
  });
  assert.match(calls[0].sql, /FROM public\.visitor_visits v/);
  assert.match(calls[0].sql, /LEFT JOIN public\.visitor_passes p/);
  assert.match(calls[0].sql, /CASE WHEN p\.id IS NULL THEN NULL/);
  assert.match(calls[0].sql, /p\.estate_id = v\.estate_id/);
  assert.match(calls[0].sql, /WHERE v\.estate_id = \$1/);
  assert.match(calls[0].sql, /v\.checked_out_at IS NULL/);
  assert.match(calls[0].sql, /ORDER BY v\.checked_in_at DESC/);
  assert.match(calls[0].sql, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(calls[0].values, ["estate-a", 3, 6]);
});

test("active gate visits report no next page for a short result", async () => {
  const { client } = mockClient([visit("1")]);
  assert.deepEqual(await getActiveGateVisitsForEstate(client, "estate-a", 2, 0), {
    visits: [visit("1")],
    hasMore: false,
  });
});

test("active gate visits return an empty page safely", async () => {
  const { client, calls } = mockClient([]);
  assert.deepEqual(await getActiveGateVisitsForEstate(client, "estate-a", 50, 0), {
    visits: [],
    hasMore: false,
  });
  assert.equal(calls.length, 1);
});

test("active gate visits remain visible when RLS hides the host-only visitor pass details", async () => {
  const visitWithoutPassDetails = {
    ...visit("hidden"),
    visitor_passes: null,
  };
  const { client } = mockClient([visitWithoutPassDetails]);
  const result = await getActiveGateVisitsForEstate(client, "estate-a", 10, 0);
  assert.deepEqual(result, {
    visits: [visitWithoutPassDetails],
    hasMore: false,
  });
});
