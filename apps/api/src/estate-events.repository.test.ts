import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventsForCreator } from "./estate-events.repository.js";

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

test("estate events repository scopes by estate and creator with ascending paginated results", async () => {
  const rows = [
    { id: "event-1", estate_id: "estate-1", created_by: "user-1" },
    { id: "event-2", estate_id: "estate-1", created_by: "user-1" },
    { id: "event-3", estate_id: "estate-1", created_by: "user-1" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getEstateEventsForCreator(client, "estate-1", "user-1", 2, 4);
  assert.deepEqual(result, { events: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.estate_events/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1/);
  assert.match(calls[0].sql, /AND created_by = \$2/);
  assert.match(calls[0].sql, /ORDER BY starts_at ASC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["estate-1", "user-1", 3, 4]);
});

test("estate events repository returns short and empty pages", async () => {
  const rows = [{ id: "event-1", estate_id: "estate-1", created_by: "user-1" }];
  const first = mockClient(rows);
  assert.deepEqual(await getEstateEventsForCreator(first.client, "estate-1", "user-1", 10, 0), {
    events: rows, hasMore: false,
  });
  const empty = mockClient([]);
  assert.deepEqual(await getEstateEventsForCreator(empty.client, "estate-1", "user-1", 10, 0), {
    events: [], hasMore: false,
  });
});
