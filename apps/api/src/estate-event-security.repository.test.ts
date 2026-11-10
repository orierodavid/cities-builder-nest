import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { verifyEstateEventInvitation } from "./estate-event-security.repository.js";

test("event invitation verification delegates lookup to the scoped security function", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const row = {
    status: "verified",
    event_data: { id: "event-1", status: "published" },
    invitation_data: { id: "invite-1", status: "active" },
    guest_data: { id: "guest-1", guest_name: "Guest" },
    check_in_data: null,
  };
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [row], rowCount: 1 } as unknown as QueryResult;
    },
  } as unknown as PoolClient;
  assert.deepEqual(await verifyEstateEventInvitation(client, "estate-1", "event-1", "hash"), {
    status: "verified", event: row.event_data, invitation: row.invitation_data,
    guest: row.guest_data, checkIn: null,
  });
  assert.match(calls[0].sql, /verify_estate_event_invitation_for_security/);
  assert.deepEqual(calls[0].values, ["estate-1", "event-1", "hash"]);
});

test("event invitation verification returns null when the guarded function returns no row", async () => {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as PoolClient;
  assert.equal(await verifyEstateEventInvitation(client, "estate-1", "event-1", "hash"), null);
});
