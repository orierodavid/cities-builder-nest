import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventCheckIns } from "./estate-event-checkins.repository.js";

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

test("event check-in repository scopes by estate and event with guest details and stable newest-first pagination", async () => {
  const rows = [
    {
      id: "checkin-1",
      guest_id: "guest-1",
      invitation_id: "invitation-1",
      checked_in_at: "2026-11-10T10:00:00.000Z",
      estate_event_guests: { guest_name: "Guest One", email: null, phone: null },
    },
    {
      id: "checkin-2",
      guest_id: "guest-2",
      invitation_id: null,
      checked_in_at: "2026-11-10T09:00:00.000Z",
      estate_event_guests: { guest_name: "Guest Two", email: "guest@example.com", phone: "123" },
    },
    {
      id: "checkin-3",
      guest_id: "guest-3",
      invitation_id: null,
      checked_in_at: "2026-11-10T08:00:00.000Z",
      estate_event_guests: { guest_name: "Guest Three", email: null, phone: null },
    },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getEstateEventCheckIns(client, "estate-1", "event-1", 2, 4);

  assert.deepEqual(result, { checkIns: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.estate_event_checkins c/);
  assert.match(calls[0].sql, /INNER JOIN public\.estate_event_guests g/);
  assert.match(calls[0].sql, /g\.estate_id = c\.estate_id/);
  assert.match(calls[0].sql, /g\.event_id = c\.event_id/);
  assert.match(calls[0].sql, /WHERE c\.estate_id = \$1 AND c\.event_id = \$2/);
  assert.match(calls[0].sql, /ORDER BY c\.checked_in_at DESC, c\.id DESC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["estate-1", "event-1", 3, 4]);
});

test("event check-in repository handles short and empty pages", async () => {
  const rows = [{ id: "checkin-1", guest_id: "guest-1" }];
  const first = mockClient(rows);
  assert.deepEqual(
    await getEstateEventCheckIns(first.client, "estate-1", "event-1", 10, 0),
    { checkIns: rows, hasMore: false },
  );
  const empty = mockClient([]);
  assert.deepEqual(
    await getEstateEventCheckIns(empty.client, "estate-1", "event-1", 10, 0),
    { checkIns: [], hasMore: false },
  );
});
