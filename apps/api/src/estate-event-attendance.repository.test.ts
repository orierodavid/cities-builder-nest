import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getEstateEventAttendanceSummaries } from "./estate-event-attendance.repository.js";

test("attendance summaries aggregate only the caller's paginated estate events", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return {
        rows: [{ event_id: "event-1", total_guests: 4, checked_in: 1, active_invitations: 3 }],
        rowCount: 1,
      } as unknown as QueryResult;
    },
  } as unknown as PoolClient;

  assert.deepEqual(await getEstateEventAttendanceSummaries(client, "estate-1", "creator-1", 20, 0), [{
    eventId: "event-1", totalGuests: 4, checkedIn: 1, activeInvitations: 3,
    outstanding: 3, attendancePercentage: 25,
  }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE e\\.estate_id = \\$1 AND e\\.created_by = \\$2/);
  assert.match(calls[0].sql, /ORDER BY e.starts_at ASC, e.id ASC/);
  assert.match(calls[0].sql, /WITH event_page AS/);
  assert.match(calls[0].sql, /JOIN event_page e ON e.id = g.event_id AND e.estate_id = g.estate_id/);
  assert.match(calls[0].sql, /JOIN event_page e ON e.id = c.event_id AND e.estate_id = c.estate_id/);
  assert.match(calls[0].sql, /JOIN event_page e ON e.id = i.event_id AND e.estate_id = i.estate_id/);
  assert.match(calls[0].sql, /WHERE i.status = 'active'/);
  assert.deepEqual(calls[0].values, ["estate-1", "creator-1", 20, 0]);
});
