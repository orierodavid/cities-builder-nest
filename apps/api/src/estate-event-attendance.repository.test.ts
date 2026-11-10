import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventAttendanceReport } from "./estate-event-attendance.repository.js";

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

const event = {
  id: "event-1",
  title: "Community meeting",
  venue: "Hall",
  starts_at: "2026-11-10T10:00:00.000Z",
  ends_at: "2026-11-10T11:00:00.000Z",
  status: "published",
};
const guest = (id: string, name: string) => ({
  id, guest_name: name, email: null, phone: null,
  invitationStatus: "active" as const,
  checkedInAt: null,
  attendanceStatus: "not_checked_in" as const,
});

test("attendance report scopes all related reads, aggregates summary and paginates guests", async () => {
  const guests = [guest("g1", "Ada"), guest("g2", "Bola"), guest("g3", "Chika")];
  const { client, calls } = mockClient([{
    event,
    total_guests: 3,
    checked_in: 1,
    active_invitations: 2,
    guests,
  }]);

  const report = await getEstateEventAttendanceReport(client, "estate-1", "event-1", 2, 0);

  assert.deepEqual(report, {
    event,
    summary: {
      totalGuests: 3,
      checkedIn: 1,
      outstanding: 2,
      activeInvitations: 2,
      attendancePercentage: 33,
    },
    guests: guests.slice(0, 2),
    hasMore: true,
  });
  assert.match(calls[0].sql, /FROM public\.estate_events e/);
  assert.match(calls[0].sql, /FROM public\.estate_event_guests g/);
  assert.match(calls[0].sql, /FROM public\.estate_event_invitations i/);
  assert.match(calls[0].sql, /FROM public\.estate_event_checkins c/);
  assert.match(calls[0].sql, /g\.estate_id = e\.estate_id AND g\.event_id = e\.id/);
  assert.match(calls[0].sql, /ORDER BY g\.guest_name ASC, g\.id ASC/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0].values, ["event-1", "estate-1", 3, 0]);
});

test("attendance report returns null when event is not visible", async () => {
  const { client } = mockClient([]);
  assert.equal(await getEstateEventAttendanceReport(client, "estate-1", "event-1", 20, 0), null);
});

test("attendance report handles empty guest page and zero guests", async () => {
  const { client } = mockClient([{
    event, total_guests: 0, checked_in: 0, active_invitations: 0, guests: [],
  }]);
  assert.deepEqual(await getEstateEventAttendanceReport(client, "estate-1", "event-1", 20, 0), {
    event,
    summary: {
      totalGuests: 0, checkedIn: 0, outstanding: 0,
      activeInvitations: 0, attendancePercentage: 0,
    },
    guests: [],
    hasMore: false,
  });
});
