import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventGuests } from "./estate-event-guests.repository.js";

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

test("event guest repository scopes by estate and event with stable ascending pagination", async () => {
  const rows = [
    { id: "guest-1", estate_id: "estate-1", event_id: "event-1" },
    { id: "guest-2", estate_id: "estate-1", event_id: "event-1" },
    { id: "guest-3", estate_id: "estate-1", event_id: "event-1" },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getEstateEventGuests(client, "estate-1", "event-1", 2, 4);
  assert.deepEqual(result, { guests: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.estate_event_guests/);
  assert.match(calls[0].sql, /WHERE estate_id = \$1 AND event_id = \$2/);
  assert.match(calls[0].sql, /ORDER BY created_at ASC, id ASC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["estate-1", "event-1", 3, 4]);
});

test("event guest repository handles short and empty pages", async () => {
  const rows = [{ id: "guest-1", estate_id: "estate-1", event_id: "event-1" }];
  const first = mockClient(rows);
  assert.deepEqual(await getEstateEventGuests(first.client, "estate-1", "event-1", 10, 0), {
    guests: rows, hasMore: false,
  });
  const empty = mockClient([]);
  assert.deepEqual(await getEstateEventGuests(empty.client, "estate-1", "event-1", 10, 0), {
    guests: [], hasMore: false,
  });
});
