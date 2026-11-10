import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  createEstateEventCheckIn,
  createEstateEventGuest,
  deleteEstateEventGuest,
  issueEstateEventInvitation,
  revokeEstateEventInvitation,
} from "./estate-event-mutations.repository.js";

function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("guest creation is parameterized and records the authenticated creator", async () => {
  const guest = { id: "g1", estate_id: "e1", event_id: "ev1", guest_name: "Guest", email: null, phone: null, notes: "", created_at: "now", updated_at: "now" };
  const { client, calls } = mockClient([[guest]]);
  assert.deepEqual(await createEstateEventGuest(client, { estateId: "e1", eventId: "ev1", guestName: "Guest", email: null, phone: null, notes: "", userId: "u1" }), guest);
  assert.deepEqual(calls[0].values, ["e1", "ev1", "Guest", null, null, "", "u1"]);
  assert.match(calls[0].sql, /INSERT INTO public\.estate_event_guests/);
});

test("guest deletion scopes by estate, event and guest", async () => {
  const { client, calls } = mockClient([[{ id: "g1" }]]);
  assert.equal(await deleteEstateEventGuest(client, "e1", "ev1", "g1"), "g1");
  assert.deepEqual(calls[0].values, ["e1", "ev1", "g1"]);
  assert.match(calls[0].sql, /DELETE FROM public\.estate_event_guests/);
});

test("invitation replacement locks the guest and atomically revokes before inserting", async () => {
  const context = {
    guest: { id: "g1", guest_name: "Guest", email: null, phone: null },
    event: { id: "ev1", title: "Event", venue: "Hall", starts_at: "start", ends_at: "end", venue_approval_status: "approved" },
  };
  const invitation = { id: "i1", guest_id: "g1", status: "active", created_at: "now" };
  const { client, calls } = mockClient([[context], [], [invitation]]);
  const result = await issueEstateEventInvitation(client, { estateId: "e1", eventId: "ev1", guestId: "g1", codeHash: "a".repeat(64), userId: "u1", revokedAt: "now" });
  assert.deepEqual(result, { kind: "created", context, invitation });
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FOR UPDATE OF g/);
  assert.match(calls[1].sql, /status = 'revoked'/);
  assert.match(calls[2].sql, /INSERT INTO public\.estate_event_invitations/);
  assert.deepEqual(calls[2].values, ["e1", "ev1", "g1", "a".repeat(64), "u1"]);
});

test("invitation creation returns null when the guest or event is not visible", async () => {
  const { client, calls } = mockClient([[]]);
  assert.equal(await issueEstateEventInvitation(client, { estateId: "e1", eventId: "ev1", guestId: "g1", codeHash: "a".repeat(64), userId: "u1", revokedAt: "now" }), null);
  assert.equal(calls.length, 1);
});

test("invitation revocation is estate/event scoped and only changes active invitations", async () => {
  const invitation = { id: "i1", status: "revoked", revoked_at: "now" };
  const { client, calls } = mockClient([[invitation]]);
  assert.deepEqual(await revokeEstateEventInvitation(client, { estateId: "e1", eventId: "ev1", invitationId: "i1", revokedAt: "now" }), invitation);
  assert.deepEqual(calls[0].values, ["i1", "e1", "ev1", "now"]);
  assert.match(calls[0].sql, /status = 'active'/);
});

test("check-in creation records the validated invitation and authenticated user", async () => {
  const checkIn = { id: "c1", guest_id: "g1", invitation_id: "i1", checked_in_at: "now" };
  const { client, calls } = mockClient([
    [{ id: "i1", guest_id: "g1", guest_name: "Guest", email: null, phone: null }],
    [checkIn],
  ]);
  const result = await createEstateEventCheckIn(client, { estateId: "e1", eventId: "ev1", codeHash: "b".repeat(64), userId: "u1" });
  assert.deepEqual(result, { kind: "created", checkIn, guest: { id: "g1", guest_name: "Guest", email: null, phone: null } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].values, ["e1", "ev1", "g1", "i1", "u1"]);
  assert.match(calls[1].sql, /ON CONFLICT \(event_id, guest_id\) DO NOTHING/);
});

test("check-in returns the existing attendance record without creating a duplicate", async () => {
  const existing = { id: "c1", checked_in_at: "earlier" };
  const { client } = mockClient([
    [{ id: "i1", guest_id: "g1", guest_name: "Guest", email: null, phone: null }],
    [],
    [existing],
  ]);
  const result = await createEstateEventCheckIn(client, { estateId: "e1", eventId: "ev1", codeHash: "b".repeat(64), userId: "u1" });
  assert.deepEqual(result, { kind: "already_checked_in", checkIn: existing, guest: { id: "g1", guest_name: "Guest", email: null, phone: null } });
});

test("check-in fails closed when the invitation is not visible", async () => {
  const { client, calls } = mockClient([[]]);
  assert.deepEqual(await createEstateEventCheckIn(client, { estateId: "e1", eventId: "ev1", codeHash: "b".repeat(64), userId: "u1" }), { kind: "not_found" });
  assert.equal(calls.length, 1);
});

test("pending venue approval prevents invitation revocation and insertion", async () => {
  const context = {
    guest: { id: "g1", guest_name: "Guest", email: null, phone: null },
    event: { id: "ev1", title: "Event", venue: "Hall", starts_at: "start", ends_at: "end", venue_approval_status: "pending" },
  };
  const { client, calls } = mockClient([[context]]);
  const result = await issueEstateEventInvitation(client, { estateId: "e1", eventId: "ev1", guestId: "g1", codeHash: "a".repeat(64), userId: "u1", revokedAt: "now" });
  assert.deepEqual(result, { kind: "venue_pending", context });
  assert.equal(calls.length, 1, "must not revoke or insert before approval");
});
