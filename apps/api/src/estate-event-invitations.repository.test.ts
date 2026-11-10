import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventInvitations } from "./estate-event-invitations.repository.js";

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

test("event invitation repository scopes by estate and event with guest details and stable newest-first pagination", async () => {
  const rows = [
    {
      id: "invitation-1",
      guest_id: "guest-1",
      status: "active",
      created_at: "2026-11-10T10:00:00.000Z",
      estate_event_guests: { guest_name: "Guest One", email: null, phone: null },
    },
    {
      id: "invitation-2",
      guest_id: "guest-2",
      status: "revoked",
      created_at: "2026-11-10T09:00:00.000Z",
      estate_event_guests: { guest_name: "Guest Two", email: "guest@example.com", phone: "123" },
    },
    {
      id: "invitation-3",
      guest_id: "guest-3",
      status: "active",
      created_at: "2026-11-10T08:00:00.000Z",
      estate_event_guests: { guest_name: "Guest Three", email: null, phone: null },
    },
  ];
  const { client, calls } = mockClient(rows);
  const result = await getEstateEventInvitations(client, "estate-1", "event-1", 2, 4);

  assert.deepEqual(result, { invitations: rows.slice(0, 2), hasMore: true });
  assert.match(calls[0].sql, /FROM public\.estate_event_invitations i/);
  assert.match(calls[0].sql, /INNER JOIN public\.estate_event_guests g/);
  assert.match(calls[0].sql, /g\.estate_id = i\.estate_id/);
  assert.match(calls[0].sql, /g\.event_id = i\.event_id/);
  assert.match(calls[0].sql, /WHERE i\.estate_id = \$1 AND i\.event_id = \$2/);
  assert.match(calls[0].sql, /ORDER BY i\.created_at DESC, i\.id DESC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["estate-1", "event-1", 3, 4]);
});

test("event invitation repository handles short and empty pages", async () => {
  const rows = [{ id: "invitation-1", guest_id: "guest-1", status: "active" }];
  const first = mockClient(rows);
  assert.deepEqual(
    await getEstateEventInvitations(first.client, "estate-1", "event-1", 10, 0),
    { invitations: rows, hasMore: false },
  );
  const empty = mockClient([]);
  assert.deepEqual(
    await getEstateEventInvitations(empty.client, "estate-1", "event-1", 10, 0),
    { invitations: [], hasMore: false },
  );
});
