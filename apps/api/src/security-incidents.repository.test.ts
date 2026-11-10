import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getSecurityIncidents } from "./security-incidents.repository.js";

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

test("security incident repository scopes to estate and paginates newest first", async () => {
  const rows = [
    { id: "incident-1", estate_id: "estate-1", status: "open" },
    { id: "incident-2", estate_id: "estate-1", status: "under_review" },
    { id: "incident-3", estate_id: "estate-1", status: "resolved" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getSecurityIncidents(client, "estate-1", 2, 4);
  assert.deepEqual(result, { incidents: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\\.security_incident_reports/);
  assert.match(calls[0].sql, /WHERE estate_id = \\$1/);
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);
  assert.match(calls[0].sql, /LIMIT \\$2 OFFSET \\$3/);
  assert.deepEqual(calls[0].values, ["estate-1", 3, 4]);
});

test("security incident repository returns short and empty pages", async () => {
  const rows = [{ id: "incident-1", estate_id: "estate-1" }];
  const first = mockClient(rows);
  assert.deepEqual(await getSecurityIncidents(first.client, "estate-1", 10, 0), {
    incidents: rows, hasMore: false,
  });
  const empty = mockClient([]);
  assert.deepEqual(await getSecurityIncidents(empty.client, "estate-1", 10, 0), {
    incidents: [], hasMore: false,
  });
});
